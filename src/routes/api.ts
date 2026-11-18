import crypto from 'crypto';
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  activityLogs,
  agencies,
  automationRules,
  categories,
  customers,
  invoices,
  kbArticles,
  memberships,
  notifications,
  organizations,
  satisfactionSurveys,
  slaPolicies,
  surveyInvitations,
  surveyTemplates,
  teams,
  ticketMessages,
  tickets,
  users,
} from '../db/schema.ts';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_REQUEST_TYPES,
  buildDefaultSurveyTemplates,
  ensureDemoDataForUser,
  ensureOrgCertificationAndSurveys,
} from '../db/seed.ts';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { runAutomationsForTicket } from '../services/automation.ts';
import {
  analyzeTicketWithAI,
  generateQualityInsightsWithAI,
  generateReplySuggestionsWithAI,
} from '../services/ai.ts';

const router = Router();
router.use(requireAuth);

async function logActivity(
  orgId: number,
  user: typeof users.$inferSelect,
  action: string,
  targetType: string,
  targetId: string,
  details = ''
) {
  await db.insert(activityLogs).values({
    orgId,
    actorName: user.fullName,
    actorEmail: user.email,
    action,
    targetType,
    targetId,
    details,
  });
}

// Bootstrap full tenant workspace
router.get('/workspace/bootstrap', async (req: AuthRequest, res) => {
  try {
    const user = req.dbUser!;
    const defaultOrgId = await ensureDemoDataForUser(user);
    const activeOrgId = req.orgId || defaultOrgId;

    // Orgs available to this user
    const userMemberships = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, user.id));

    const allOrgs = user.isSuperAdmin
      ? await db.select().from(organizations).orderBy(organizations.id)
      : await db
          .select()
          .from(organizations)
          .where(
            eq(
              organizations.id,
              userMemberships[0]?.orgId ?? activeOrgId
            )
          );

    const activeOrg =
      allOrgs.find((o) => o.id === activeOrgId) || allOrgs[0];

    if (!activeOrg) {
      return res.status(404).json({ error: 'Aucune organisation disponible.' });
    }

    const oid = activeOrg.id;
    await ensureOrgCertificationAndSurveys(oid);
    const currentMem = userMemberships.find((m) => m.orgId === oid);
    const activeRole = currentMem?.role || (user.isSuperAdmin ? 'SUPER_ADMIN' : 'AGENT');

    const [
      orgAgencies,
      orgTeams,
      orgMembersRaw,
      orgCategories,
      orgSlaPolicies,
      orgCustomers,
      orgTickets,
      orgMessages,
      orgSurveys,
      orgSurveyTemplates,
      orgSurveyInvitations,
      orgAutomations,
      orgKbArticles,
      orgNotifications,
      orgLogs,
      orgInvoices,
      allUsers,
    ] = await Promise.all([
      db.select().from(agencies).where(eq(agencies.orgId, oid)).orderBy(agencies.id),
      db.select().from(teams).where(eq(teams.orgId, oid)).orderBy(teams.id),
      db.select().from(memberships).where(eq(memberships.orgId, oid)).orderBy(memberships.id),
      db.select().from(categories).where(eq(categories.orgId, oid)).orderBy(categories.id),
      db.select().from(slaPolicies).where(eq(slaPolicies.orgId, oid)).orderBy(slaPolicies.id),
      db.select().from(customers).where(eq(customers.orgId, oid)).orderBy(desc(customers.createdAt)),
      db.select().from(tickets).where(eq(tickets.orgId, oid)).orderBy(desc(tickets.updatedAt)),
      db.select().from(ticketMessages).where(eq(ticketMessages.orgId, oid)).orderBy(ticketMessages.createdAt),
      db.select().from(satisfactionSurveys).where(eq(satisfactionSurveys.orgId, oid)).orderBy(desc(satisfactionSurveys.submittedAt)),
      db.select().from(surveyTemplates).where(eq(surveyTemplates.orgId, oid)).orderBy(surveyTemplates.id),
      db.select().from(surveyInvitations).where(eq(surveyInvitations.orgId, oid)).orderBy(desc(surveyInvitations.sentAt)),
      db.select().from(automationRules).where(eq(automationRules.orgId, oid)).orderBy(automationRules.id),
      db.select().from(kbArticles).where(eq(kbArticles.orgId, oid)).orderBy(desc(kbArticles.updatedAt)),
      db.select().from(notifications).where(eq(notifications.orgId, oid)).orderBy(desc(notifications.createdAt)),
      db.select().from(activityLogs).where(eq(activityLogs.orgId, oid)).orderBy(desc(activityLogs.createdAt)).limit(50),
      db.select().from(invoices).where(eq(invoices.orgId, oid)).orderBy(desc(invoices.createdAt)),
      db.select().from(users),
    ]);

    const usersById = new Map(allUsers.map((u) => [u.id, u]));
    const orgMembers = orgMembersRaw.map((m) => {
      const u = usersById.get(m.userId);
      return {
        ...m,
        fullName: u?.fullName || 'Collaborateur',
        email: u?.email || '',
        avatarUrl: u?.avatarUrl || null,
      };
    });

    res.json({
      currentUser: {
        ...user,
        activeRole,
      },
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      accessibleOrganizations: user.isSuperAdmin
        ? allOrgs
        : allOrgs.filter((o) => userMemberships.some((m) => m.orgId === o.id)),
      activeOrganization: activeOrg,
      agencies: orgAgencies,
      teams: orgTeams,
      members: orgMembers,
      categories: orgCategories,
      slaPolicies: orgSlaPolicies,
      customers: orgCustomers,
      tickets: orgTickets,
      messages: orgMessages,
      surveys: orgSurveys,
      surveyTemplates: orgSurveyTemplates,
      surveyInvitations: orgSurveyInvitations,
      automations: orgAutomations,
      kbArticles: orgKbArticles,
      notifications: orgNotifications,
      activityLogs: orgLogs,
      invoices: orgInvoices,
    });
  } catch (error) {
    console.error('Bootstrap error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de l’espace de travail.' });
  }
});

// ---------------- TICKETS ----------------
router.post('/tickets', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const {
      subject,
      description,
      customerId,
      category,
      subcategory,
      requestType,
      channel,
      priority,
      agencyId,
      teamId,
      assignedUserId,
      tags,
    } = req.body;

    if (!subject || !description || !customerId || !category) {
      return res.status(400).json({ error: 'Sujet, description, client et catégorie sont requis.' });
    }

    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, Number(customerId)), eq(customers.orgId, oid)))
      .limit(1);

    if (!customer) {
      return res.status(404).json({ error: 'Client introuvable dans cette organisation.' });
    }

    const prio = priority || 'NORMALE';
    const policies = await db
      .select()
      .from(slaPolicies)
      .where(and(eq(slaPolicies.orgId, oid), eq(slaPolicies.isActive, true)));

    const matchedPolicy =
      policies.find((p) => p.priority === prio) ||
      policies[0];

    const now = Date.now();
    const firstRespMins = matchedPolicy?.firstResponseMinutes ?? 240;
    const resMins = matchedPolicy?.resolutionMinutes ?? 1440;

    const existingTickets = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.orgId, oid));
    const seq = existingTickets.length + 101;
    const ticketNumber = `CP-2026-${String(seq).padStart(4, '0')}`;

    const [created] = await db
      .insert(tickets)
      .values({
        orgId: oid,
        ticketNumber,
        subject: String(subject).trim(),
        description: String(description).trim(),
        customerId: customer.id,
        category,
        subcategory: subcategory || 'Général',
        requestType: requestType || 'Réclamation',
        channel: channel || 'WEB_FORM',
        priority: prio,
        status: assignedUserId ? 'ASSIGNE' : 'NOUVEAU',
        agencyId: agencyId ? Number(agencyId) : customer.agencyId,
        teamId: teamId ? Number(teamId) : null,
        assignedUserId: assignedUserId ? Number(assignedUserId) : null,
        tags: Array.isArray(tags) ? tags : [],
        firstResponseDueAt: new Date(now + firstRespMins * 60000),
        resolutionDueAt: new Date(now + resMins * 60000),
      })
      .returning();

    await db.insert(ticketMessages).values({
      orgId: oid,
      ticketId: created.id,
      authorType: 'CUSTOMER',
      authorName: customer.fullName,
      body: created.description,
      isInternalNote: false,
      attachments: [],
    });

    await db.insert(notifications).values({
      orgId: oid,
      type: assignedUserId ? 'ASSIGNED' : 'NEW_TICKET',
      title: `Nouveau ticket ${ticketNumber}`,
      message: `${customer.fullName} (${customer.companyName || customer.customerType}) — ${created.subject}`,
      ticketId: created.id,
      isRead: false,
    });

    await logActivity(oid, user, 'CREATED_TICKET', 'TICKET', ticketNumber, created.subject);
    await runAutomationsForTicket(oid, created.id, 'TICKET_CREATED', customer.customerType);

    const [fresh] = await db.select().from(tickets).where(eq(tickets.id, created.id));
    res.status(201).json(fresh);
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Impossible de créer le ticket.' });
  }
});

router.patch('/tickets/:id', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const ticketId = Number(req.params.id);

    const [existing] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, oid)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Ticket introuvable.' });
    }

    const patch: Partial<typeof tickets.$inferInsert> = {
      updatedAt: new Date(),
    };

    const allowedFields = [
      'subject',
      'description',
      'category',
      'subcategory',
      'requestType',
      'priority',
      'status',
      'agencyId',
      'teamId',
      'assignedUserId',
      'rootCause',
      'solutionSummary',
      'tags',
    ] as const;

    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        (patch as Record<string, unknown>)[key] = req.body[key];
      }
    }

    if (req.body.status === 'RESOLU' && !existing.resolvedAt) {
      patch.resolvedAt = new Date();
    }
    if (req.body.status === 'CLOTURE' && !existing.closedAt) {
      patch.closedAt = new Date();
    }
    if (req.body.status === 'REOUVERT' && existing.status !== 'REOUVERT') {
      patch.reopenCount = existing.reopenCount + 1;
      patch.resolvedAt = null;
      patch.closedAt = null;
      await db.insert(notifications).values({
        orgId: oid,
        type: 'REOPENED',
        title: `Ticket réouvert — ${existing.ticketNumber}`,
        message: `${existing.subject} a été réouvert par ${user.fullName}.`,
        ticketId: existing.id,
        isRead: false,
      });
    }
    if (req.body.status === 'ESCALADE' && existing.status !== 'ESCALADE') {
      await db.insert(notifications).values({
        orgId: oid,
        type: 'ESCALATION',
        title: `Escalade — ${existing.ticketNumber}`,
        message: `Le dossier "${existing.subject}" a été escaladé.`,
        ticketId: existing.id,
        isRead: false,
      });
    }

    const [updated] = await db
      .update(tickets)
      .set(patch)
      .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, oid)))
      .returning();

    await logActivity(
      oid,
      user,
      'UPDATED_TICKET',
      'TICKET',
      existing.ticketNumber,
      `Statut: ${updated.status} · Priorité: ${updated.priority}`
    );

    if (req.body.status === 'RESOLU') {
      await runAutomationsForTicket(oid, ticketId, 'TICKET_RESOLVED');
      // Auto-generate a survey invitation if none exists yet for this ticket
      const existingInvite = await db
        .select()
        .from(surveyInvitations)
        .where(and(eq(surveyInvitations.orgId, oid), eq(surveyInvitations.ticketId, ticketId)))
        .limit(1);
      if (existingInvite.length === 0) {
        const templates = await db
          .select()
          .from(surveyTemplates)
          .where(and(eq(surveyTemplates.orgId, oid), eq(surveyTemplates.isActive, true)));
        const matchedTpl =
          templates.find((t) => t.targetCategory.toLowerCase() === updated.category.toLowerCase()) ||
          templates.find((t) => t.targetCategory === 'ALL') ||
          templates[0];
        if (matchedTpl) {
          const inviteToken = `srv-${crypto.randomBytes(6).toString('hex')}`;
          await db.insert(surveyInvitations).values({
            orgId: oid,
            token: inviteToken,
            templateId: matchedTpl.id,
            ticketId: updated.id,
            customerId: updated.customerId,
            channel: 'EMAIL',
            status: 'SENT',
          });
        }
      }
    } else {
      await runAutomationsForTicket(oid, ticketId, 'TICKET_UPDATED');
    }

    const [fresh] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    res.json(fresh);
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du ticket.' });
  }
});

router.post('/tickets/:id/messages', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const ticketId = Number(req.params.id);
    const { body, isInternalNote, attachments } = req.body;

    if (!body || !String(body).trim()) {
      return res.status(400).json({ error: 'Le message ne peut pas être vide.' });
    }

    const [existing] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, oid)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Ticket introuvable.' });
    }

    const [msg] = await db
      .insert(ticketMessages)
      .values({
        orgId: oid,
        ticketId,
        authorType: 'AGENT',
        authorName: user.fullName,
        authorUserId: user.id,
        body: String(body).trim(),
        isInternalNote: Boolean(isInternalNote),
        attachments: Array.isArray(attachments) ? attachments : [],
      })
      .returning();

    const ticketPatch: Partial<typeof tickets.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (!isInternalNote && !existing.firstResponseAt) {
      ticketPatch.firstResponseAt = new Date();
    }
    if (!isInternalNote && (existing.status === 'NOUVEAU' || existing.status === 'ASSIGNE')) {
      ticketPatch.status = 'EN_COURS';
    }

    await db.update(tickets).set(ticketPatch).where(eq(tickets.id, ticketId));

    await logActivity(
      oid,
      user,
      isInternalNote ? 'ADDED_INTERNAL_NOTE' : 'REPLIED_TO_TICKET',
      'TICKET',
      existing.ticketNumber,
      String(body).slice(0, 80)
    );

    res.status(201).json(msg);
  } catch (error) {
    console.error('Add message error:', error);
    res.status(500).json({ error: 'Impossible d’ajouter le message.' });
  }
});

router.post('/tickets/:id/merge', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const sourceId = Number(req.params.id);
    const targetId = Number(req.body.targetTicketId);

    if (!targetId || sourceId === targetId) {
      return res.status(400).json({ error: 'Ticket cible invalide pour la fusion.' });
    }

    const [source] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, sourceId), eq(tickets.orgId, oid)))
      .limit(1);

    const [target] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, targetId), eq(tickets.orgId, oid)))
      .limit(1);

    if (!source || !target) {
      return res.status(404).json({ error: 'Ticket source ou cible introuvable.' });
    }

    await db.insert(ticketMessages).values({
      orgId: oid,
      ticketId: target.id,
      authorType: 'SYSTEM',
      authorName: 'Système Fusion',
      body: `Doublon fusionné depuis ${source.ticketNumber} (${source.subject}) : ${source.description}`,
      isInternalNote: true,
      attachments: [],
    });

    await db
      .update(tickets)
      .set({
        status: 'CLOTURE',
        mergedIntoTicketId: target.id,
        closedAt: new Date(),
        updatedAt: new Date(),
        solutionSummary: `Fusionné dans ${target.ticketNumber}`,
      })
      .where(eq(tickets.id, source.id));

    await logActivity(
      oid,
      user,
      'MERGED_TICKETS',
      'TICKET',
      source.ticketNumber,
      `Fusionné dans ${target.ticketNumber}`
    );

    res.json({ success: true, mergedInto: target.ticketNumber });
  } catch (error) {
    console.error('Merge error:', error);
    res.status(500).json({ error: 'Erreur lors de la fusion des doublons.' });
  }
});

router.post('/tickets/import-csv', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const rows: Array<{
      subject: string;
      description: string;
      customerEmail: string;
      customerName?: string;
      category?: string;
      priority?: string;
    }> = req.body.rows || [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Aucune ligne valide détectée pour l’import.' });
    }

    const existingTickets = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.orgId, oid));
    let seq = existingTickets.length + 101;
    const createdList = [];

    for (const row of rows.slice(0, 50)) {
      if (!row.subject || !row.customerEmail) continue;
      let [cust] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.orgId, oid), eq(customers.email, row.customerEmail)))
        .limit(1);

      if (!cust) {
        [cust] = await db
          .insert(customers)
          .values({
            orgId: oid,
            externalCode: `CLI-${Math.floor(1000 + Math.random() * 8999)}`,
            fullName: row.customerName || row.customerEmail.split('@')[0],
            email: row.customerEmail,
            customerType: 'PME',
          })
          .returning();
      }

      const ticketNumber = `CP-2026-${String(seq++).padStart(4, '0')}`;
      const [created] = await db
        .insert(tickets)
        .values({
          orgId: oid,
          ticketNumber,
          subject: row.subject,
          description: row.description || row.subject,
          customerId: cust.id,
          category: row.category || 'Réclamation générale',
          channel: 'CSV_IMPORT',
          priority: row.priority || 'NORMALE',
          status: 'NOUVEAU',
          firstResponseDueAt: new Date(Date.now() + 4 * 3600000),
          resolutionDueAt: new Date(Date.now() + 24 * 3600000),
        })
        .returning();
      createdList.push(created);
    }

    await logActivity(oid, user, 'IMPORTED_CSV', 'TICKET', `${createdList.length} tickets`, 'Import CSV/Excel');
    res.status(201).json({ importedCount: createdList.length, tickets: createdList });
  } catch (error) {
    console.error('CSV import error:', error);
    res.status(500).json({ error: 'Erreur lors de l’import CSV.' });
  }
});

// ---------------- CUSTOMERS (CRM) ----------------
router.post('/customers', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const { fullName, email, phone, companyName, customerType, agencyId, tags, internalNotes } = req.body;
    if (!fullName || !email) {
      return res.status(400).json({ error: 'Nom complet et email requis.' });
    }
    const [created] = await db
      .insert(customers)
      .values({
        orgId: oid,
        externalCode: `CLI-${Math.floor(1000 + Math.random() * 8999)}`,
        fullName: String(fullName).trim(),
        email: String(email).trim(),
        phone: phone || '',
        companyName: companyName || '',
        customerType: customerType || 'PME',
        agencyId: agencyId ? Number(agencyId) : null,
        tags: Array.isArray(tags) ? tags : [],
        internalNotes: internalNotes || '',
      })
      .returning();

    await logActivity(oid, user, 'CREATED_CUSTOMER', 'CUSTOMER', created.externalCode, created.fullName);
    res.status(201).json(created);
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Impossible de créer le client.' });
  }
});

router.patch('/customers/:id', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const id = Number(req.params.id);
    const { fullName, email, phone, companyName, customerType, tags, internalNotes } = req.body;

    const [updated] = await db
      .update(customers)
      .set({
        ...(fullName !== undefined ? { fullName } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(companyName !== undefined ? { companyName } : {}),
        ...(customerType !== undefined ? { customerType } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(internalNotes !== undefined ? { internalNotes } : {}),
      })
      .where(and(eq(customers.id, id), eq(customers.orgId, oid)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Client introuvable.' });
    res.json(updated);
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour le client.' });
  }
});

// ---------------- CATEGORIES ----------------
router.post('/categories', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const { name, subcategories, requestTypes } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom de catégorie requis.' });

    const [created] = await db
      .insert(categories)
      .values({
        orgId: oid,
        name: String(name).trim(),
        subcategories: Array.isArray(subcategories) ? subcategories : [],
        requestTypes: Array.isArray(requestTypes) ? requestTypes : ['Réclamation', 'Demande information'],
        isDefault: false,
      })
      .returning();

    res.status(201).json(created);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Impossible de créer la catégorie.' });
  }
});

router.patch('/categories/:id', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const id = Number(req.params.id);
    const { name, subcategories, requestTypes } = req.body;
    const [updated] = await db
      .update(categories)
      .set({
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(Array.isArray(subcategories) ? { subcategories } : {}),
        ...(Array.isArray(requestTypes) ? { requestTypes } : {}),
      })
      .where(and(eq(categories.id, id), eq(categories.orgId, oid)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Catégorie introuvable.' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur mise à jour catégorie.' });
  }
});

router.delete('/categories/:id', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const id = Number(req.params.id);
    await db.delete(categories).where(and(eq(categories.id, id), eq(categories.orgId, oid)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur suppression catégorie.' });
  }
});

// ---------------- SLA POLICIES ----------------
router.post('/sla-policies', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const {
      name,
      priority,
      categoryName,
      customerType,
      firstResponseMinutes,
      resolutionMinutes,
      escalateAtPercent,
      businessHoursOnly,
    } = req.body;

    const [created] = await db
      .insert(slaPolicies)
      .values({
        orgId: oid,
        name: name || `SLA ${priority}`,
        priority: priority || 'NORMALE',
        categoryName: categoryName || 'ALL',
        customerType: customerType || 'ALL',
        firstResponseMinutes: Number(firstResponseMinutes) || 60,
        resolutionMinutes: Number(resolutionMinutes) || 480,
        escalateAtPercent: Number(escalateAtPercent) || 80,
        businessHoursOnly: Boolean(businessHoursOnly),
      })
      .returning();

    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de créer la règle SLA.' });
  }
});

router.patch('/sla-policies/:id', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const id = Number(req.params.id);
    const [updated] = await db
      .update(slaPolicies)
      .set({
        ...(req.body.firstResponseMinutes !== undefined ? { firstResponseMinutes: Number(req.body.firstResponseMinutes) } : {}),
        ...(req.body.resolutionMinutes !== undefined ? { resolutionMinutes: Number(req.body.resolutionMinutes) } : {}),
        ...(req.body.isActive !== undefined ? { isActive: Boolean(req.body.isActive) } : {}),
        ...(req.body.businessHoursOnly !== undefined ? { businessHoursOnly: Boolean(req.body.businessHoursOnly) } : {}),
      })
      .where(and(eq(slaPolicies.id, id), eq(slaPolicies.orgId, oid)))
      .returning();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur mise à jour SLA.' });
  }
});

// ---------------- SATISFACTION SURVEYS, TEMPLATES & INVITATIONS ----------------
router.post('/survey-templates', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const { title, description, targetCategory, includeCsat, includeNps, includeCes, questions } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Titre du questionnaire requis.' });
    }
    const [created] = await db
      .insert(surveyTemplates)
      .values({
        orgId: oid,
        title: String(title).trim(),
        description: description || '',
        targetCategory: targetCategory || 'ALL',
        includeCsat: includeCsat !== undefined ? Boolean(includeCsat) : true,
        includeNps: includeNps !== undefined ? Boolean(includeNps) : true,
        includeCes: includeCes !== undefined ? Boolean(includeCes) : true,
        questions: Array.isArray(questions) ? questions : [],
        isActive: true,
      })
      .returning();
    await logActivity(oid, user, 'CREATED_SURVEY_TEMPLATE', 'SURVEY_TEMPLATE', created.title);
    res.status(201).json(created);
  } catch (error) {
    console.error('Create survey template error:', error);
    res.status(500).json({ error: 'Impossible de créer le modèle de sondage.' });
  }
});

router.patch('/survey-templates/:id', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const id = Number(req.params.id);
    const [updated] = await db
      .update(surveyTemplates)
      .set({
        ...(req.body.title !== undefined ? { title: String(req.body.title).trim() } : {}),
        ...(req.body.description !== undefined ? { description: req.body.description } : {}),
        ...(req.body.targetCategory !== undefined ? { targetCategory: req.body.targetCategory } : {}),
        ...(req.body.includeCsat !== undefined ? { includeCsat: Boolean(req.body.includeCsat) } : {}),
        ...(req.body.includeNps !== undefined ? { includeNps: Boolean(req.body.includeNps) } : {}),
        ...(req.body.includeCes !== undefined ? { includeCes: Boolean(req.body.includeCes) } : {}),
        ...(Array.isArray(req.body.questions) ? { questions: req.body.questions } : {}),
        ...(req.body.isActive !== undefined ? { isActive: Boolean(req.body.isActive) } : {}),
      })
      .where(and(eq(surveyTemplates.id, id), eq(surveyTemplates.orgId, oid)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Modèle de sondage introuvable.' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur mise à jour modèle de sondage.' });
  }
});

router.post('/survey-invitations', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const { templateId, customerId, ticketId, channel } = req.body;
    if (!templateId || !customerId) {
      return res.status(400).json({ error: 'Modèle de sondage et client requis.' });
    }

    const [tpl] = await db
      .select()
      .from(surveyTemplates)
      .where(and(eq(surveyTemplates.id, Number(templateId)), eq(surveyTemplates.orgId, oid)))
      .limit(1);
    const [cust] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, Number(customerId)), eq(customers.orgId, oid)))
      .limit(1);

    if (!tpl || !cust) {
      return res.status(404).json({ error: 'Modèle ou client introuvable.' });
    }

    const token = `srv-${crypto.randomBytes(6).toString('hex')}`;
    const [created] = await db
      .insert(surveyInvitations)
      .values({
        orgId: oid,
        token,
        templateId: tpl.id,
        ticketId: ticketId ? Number(ticketId) : null,
        customerId: cust.id,
        channel: channel || 'LINK',
        status: 'SENT',
      })
      .returning();

    await db.insert(notifications).values({
      orgId: oid,
      type: 'REPORT_READY',
      title: `Sondage envoyé à ${cust.fullName}`,
      message: `Questionnaire « ${tpl.title} » généré via ${created.channel}.`,
      ticketId: created.ticketId,
      isRead: false,
    });

    await logActivity(oid, user, 'SENT_SURVEY', 'SURVEY', created.token, `${cust.fullName} · ${tpl.title}`);
    res.status(201).json({ ...created, surveyUrlPath: `/?survey=${created.token}` });
  } catch (error) {
    console.error('Create survey invitation error:', error);
    res.status(500).json({ error: 'Impossible de générer le lien de sondage.' });
  }
});

router.post('/surveys', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const { ticketId, customerId, templateId, category, csatScore, npsScore, cesScore, customAnswers, comment } = req.body;

    let resolvedCustomerId = customerId ? Number(customerId) : 0;
    let resolvedAgentId: number | null = null;
    let resolvedAgencyId: number | null = null;
    let resolvedCategory = category || 'Réclamation générale';
    let ticketNum = '';

    if (ticketId) {
      const [ticket] = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, Number(ticketId)), eq(tickets.orgId, oid)))
        .limit(1);
      if (!ticket) return res.status(404).json({ error: 'Ticket introuvable.' });
      resolvedCustomerId = ticket.customerId;
      resolvedAgentId = ticket.assignedUserId;
      resolvedAgencyId = ticket.agencyId;
      resolvedCategory = category || ticket.category;
      ticketNum = ticket.ticketNumber;
    }

    if (!resolvedCustomerId) {
      return res.status(400).json({ error: 'Client ou ticket requis.' });
    }

    const [created] = await db
      .insert(satisfactionSurveys)
      .values({
        orgId: oid,
        templateId: templateId ? Number(templateId) : null,
        ticketId: ticketId ? Number(ticketId) : null,
        customerId: resolvedCustomerId,
        agentUserId: resolvedAgentId,
        agencyId: resolvedAgencyId,
        category: resolvedCategory,
        csatScore: Math.min(5, Math.max(1, Number(csatScore) || 5)),
        npsScore: Math.min(10, Math.max(0, Number(npsScore) ?? 8)),
        cesScore: Math.min(7, Math.max(1, Number(cesScore) || 6)),
        customAnswers: Array.isArray(customAnswers) ? customAnswers : [],
        comment: comment || '',
      })
      .returning();

    if (created.csatScore <= 2) {
      await db.insert(notifications).values({
        orgId: oid,
        type: 'LOW_CSAT',
        title: `Alerte satisfaction basse (${created.csatScore}/5)${ticketNum ? ` — ${ticketNum}` : ''}`,
        message: comment || 'Un client a exprimé une insatisfaction suite à un sondage.',
        ticketId: ticketId ? Number(ticketId) : null,
        isRead: false,
      });
    }

    res.status(201).json(created);
  } catch (error) {
    console.error('Create survey error:', error);
    res.status(500).json({ error: 'Impossible d’enregistrer l’enquête.' });
  }
});

// ---------------- AUTOMATION RULES ----------------
router.post('/automations', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const { name, description, triggerEvent, conditions, actions } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom de règle requis.' });

    const [created] = await db
      .insert(automationRules)
      .values({
        orgId: oid,
        name: String(name).trim(),
        description: description || '',
        triggerEvent: triggerEvent || 'TICKET_CREATED',
        conditions: Array.isArray(conditions) ? conditions : [],
        actions: Array.isArray(actions) ? actions : [],
        isActive: true,
      })
      .returning();

    await logActivity(oid, user, 'CREATED_AUTOMATION', 'AUTOMATION', created.name);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de créer la règle d’automatisation.' });
  }
});

router.patch('/automations/:id', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const id = Number(req.params.id);
    const [updated] = await db
      .update(automationRules)
      .set({
        ...(req.body.isActive !== undefined ? { isActive: Boolean(req.body.isActive) } : {}),
        ...(req.body.name !== undefined ? { name: req.body.name } : {}),
        ...(req.body.conditions !== undefined ? { conditions: req.body.conditions } : {}),
        ...(req.body.actions !== undefined ? { actions: req.body.actions } : {}),
      })
      .where(and(eq(automationRules.id, id), eq(automationRules.orgId, oid)))
      .returning();

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de mettre à jour la règle.' });
  }
});

router.delete('/automations/:id', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    await db
      .delete(automationRules)
      .where(and(eq(automationRules.id, Number(req.params.id)), eq(automationRules.orgId, oid)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur suppression règle.' });
  }
});

// ---------------- KNOWLEDGE BASE ----------------
router.post('/kb-articles', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'AGENT', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const { title, category, articleType, content, visibility, isPublished } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Titre et contenu requis.' });

    const [created] = await db
      .insert(kbArticles)
      .values({
        orgId: oid,
        title: String(title).trim(),
        category: category || 'Général',
        articleType: articleType || 'GUIDE',
        content: String(content).trim(),
        visibility: visibility || 'PUBLIC',
        isPublished: isPublished !== undefined ? Boolean(isPublished) : true,
        authorName: user.fullName,
      })
      .returning();

    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de créer l’article.' });
  }
});

router.patch('/kb-articles/:id', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const id = Number(req.params.id);
    const [updated] = await db
      .update(kbArticles)
      .set({
        ...(req.body.title !== undefined ? { title: req.body.title } : {}),
        ...(req.body.content !== undefined ? { content: req.body.content } : {}),
        ...(req.body.category !== undefined ? { category: req.body.category } : {}),
        ...(req.body.visibility !== undefined ? { visibility: req.body.visibility } : {}),
        ...(req.body.isPublished !== undefined ? { isPublished: Boolean(req.body.isPublished) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(kbArticles.id, id), eq(kbArticles.orgId, oid)))
      .returning();

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de mettre à jour l’article.' });
  }
});

router.delete('/kb-articles/:id', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    await db.delete(kbArticles).where(and(eq(kbArticles.id, Number(req.params.id)), eq(kbArticles.orgId, oid)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur suppression article.' });
  }
});

// ---------------- AGENCIES, TEAMS, MEMBERS, ORG SETTINGS ----------------
router.post('/agencies', requireRole(['ORG_ADMIN', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const { name, code, city, country, managerName } = req.body;
    if (!name || !city) return res.status(400).json({ error: 'Nom et ville requis.' });
    const [created] = await db
      .insert(agencies)
      .values({
        orgId: oid,
        name,
        code: code || name.slice(0, 3).toUpperCase(),
        city,
        country: country || 'France',
        managerName: managerName || 'Responsable Agence',
      })
      .returning();
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de créer l’agence.' });
  }
});

router.post('/teams', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const { name, description, leadName, agencyId } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom d’équipe requis.' });
    const [created] = await db
      .insert(teams)
      .values({
        orgId: oid,
        name,
        description: description || '',
        leadName: leadName || '',
        agencyId: agencyId ? Number(agencyId) : null,
      })
      .returning();
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de créer l’équipe.' });
  }
});

router.post('/members/invite', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const actor = req.dbUser!;
    const { fullName, email, role, teamId, agencyId, jobTitle, maxLoad } = req.body;
    if (!fullName || !email) return res.status(400).json({ error: 'Nom et email requis.' });

    const normalizedEmail = String(email).trim().toLowerCase();

    // Enforce plan maxAgents quota
    const [[org], existingMembers] = await Promise.all([
      db.select().from(organizations).where(eq(organizations.id, oid)).limit(1),
      db.select().from(memberships).where(eq(memberships.orgId, oid)),
    ]);

    let [targetUser] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    const alreadyMember = targetUser
      ? existingMembers.some((m) => m.userId === targetUser.id)
      : false;

    if (!alreadyMember && org && existingMembers.length >= org.maxAgents) {
      return res.status(402).json({
        error: `Quota du plan ${org.plan} atteint (${existingMembers.length}/${org.maxAgents} collaborateurs). Passez à une offre supérieure dans Organisation & Plans.`,
      });
    }

    if (!targetUser) {
      [targetUser] = await db
        .insert(users)
        .values({
          uid: `invited-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          email: normalizedEmail,
          fullName: String(fullName).trim(),
          isSuperAdmin: false,
        })
        .returning();
    }

    const [mem] = await db
      .insert(memberships)
      .values({
        orgId: oid,
        userId: targetUser.id,
        role: role || 'AGENT',
        teamId: teamId ? Number(teamId) : null,
        agencyId: agencyId ? Number(agencyId) : null,
        jobTitle: jobTitle || 'Conseiller Clientèle',
        maxLoad: Number(maxLoad) || 15,
        status: 'INVITED',
      })
      .onConflictDoUpdate({
        target: [memberships.orgId, memberships.userId],
        set: { role: role || 'AGENT' },
      })
      .returning();

    await logActivity(oid, actor, 'INVITED_MEMBER', 'USER', normalizedEmail, `Rôle: ${role || 'AGENT'}`);
    res.status(201).json({ ...mem, fullName: targetUser.fullName, email: targetUser.email });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Impossible d’inviter le collaborateur.' });
  }
});

router.patch('/members/:id', requireRole(['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const id = Number(req.params.id);
    const [updated] = await db
      .update(memberships)
      .set({
        ...(req.body.role !== undefined ? { role: req.body.role } : {}),
        ...(req.body.teamId !== undefined ? { teamId: req.body.teamId ? Number(req.body.teamId) : null } : {}),
        ...(req.body.agencyId !== undefined ? { agencyId: req.body.agencyId ? Number(req.body.agencyId) : null } : {}),
        ...(req.body.maxLoad !== undefined ? { maxLoad: Number(req.body.maxLoad) } : {}),
        ...(req.body.status !== undefined ? { status: req.body.status } : {}),
      })
      .where(and(eq(memberships.id, id), eq(memberships.orgId, oid)))
      .returning();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur mise à jour collaborateur.' });
  }
});

router.patch('/organization', requireRole(['ORG_ADMIN', 'SUPER_ADMIN']), async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const { name, industry, portalTitle, primaryColor, plan, billingCycle, workingHours, holidays } = req.body;

    const planLimits: Record<string, { maxAgents: number; mrrMonthly: number; mrrAnnual: number }> = {
      STARTER: { maxAgents: 5, mrrMonthly: 7900, mrrAnnual: 6500 },
      BUSINESS: { maxAgents: 25, mrrMonthly: 24900, mrrAnnual: 19900 },
      ENTERPRISE: { maxAgents: 100, mrrMonthly: 59900, mrrAnnual: 49900 },
    };

    const targetPlan = plan || undefined;
    const cycle = billingCycle || undefined;
    let mrrUpdate: number | undefined;
    let maxAgentsUpdate: number | undefined;

    if (targetPlan && planLimits[targetPlan]) {
      maxAgentsUpdate = planLimits[targetPlan].maxAgents;
      mrrUpdate =
        (cycle || 'ANNUAL') === 'ANNUAL'
          ? planLimits[targetPlan].mrrAnnual
          : planLimits[targetPlan].mrrMonthly;
    }

    const [updated] = await db
      .update(organizations)
      .set({
        ...(name ? { name } : {}),
        ...(industry ? { industry } : {}),
        ...(portalTitle ? { portalTitle } : {}),
        ...(primaryColor ? { primaryColor } : {}),
        ...(targetPlan ? { plan: targetPlan } : {}),
        ...(cycle ? { billingCycle: cycle } : {}),
        ...(mrrUpdate !== undefined ? { mrrCents: mrrUpdate } : {}),
        ...(maxAgentsUpdate !== undefined ? { maxAgents: maxAgentsUpdate } : {}),
        ...(workingHours ? { workingHours } : {}),
        ...(holidays ? { holidays } : {}),
      })
      .where(eq(organizations.id, oid))
      .returning();

    await logActivity(oid, user, 'UPDATED_ORGANIZATION', 'ORGANIZATION', updated.name, `Plan: ${updated.plan}`);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur mise à jour organisation.' });
  }
});

// ---------------- NOTIFICATIONS ----------------
router.post('/notifications/:id/read', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const id = Number(req.params.id);
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.orgId, oid)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur notification.' });
  }
});

router.post('/notifications/read-all', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.orgId, oid));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur notifications.' });
  }
});

// ---------------- SUPER ADMIN SAAS ----------------
router.get('/super-admin/overview', async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isSuperAdmin) {
      return res.status(403).json({ error: 'Accès Super Administrateur requis.' });
    }
    const [allOrgs, allUsers, allTickets, allLogs, allInvoices] = await Promise.all([
      db.select().from(organizations).orderBy(organizations.id),
      db.select().from(users),
      db.select({ id: tickets.id, orgId: tickets.orgId, status: tickets.status }).from(tickets),
      db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(30),
      db.select().from(invoices).orderBy(desc(invoices.createdAt)),
    ]);

    const totalMrrCents = allOrgs
      .filter((o) => o.status === 'ACTIVE')
      .reduce((acc, o) => acc + o.mrrCents, 0);

    const totalCollectedCents = allInvoices
      .filter((i) => i.status === 'PAID')
      .reduce((acc, i) => acc + i.totalCents, 0);

    const orgMap = new Map(allOrgs.map((o) => [o.id, o.name]));

    res.json({
      organizations: allOrgs.map((o) => ({
        ...o,
        ticketCount: allTickets.filter((t) => t.orgId === o.id).length,
      })),
      totalUsers: allUsers.length,
      totalTickets: allTickets.length,
      totalMrrCents,
      totalCollectedCents,
      invoices: allInvoices.slice(0, 30).map((i) => ({
        ...i,
        orgName: orgMap.get(i.orgId) || `Organisation #${i.orgId}`,
      })),
      recentLogs: allLogs,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur console Super Admin.' });
  }
});

router.post('/super-admin/invoices/:id/mark-paid', async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isSuperAdmin) {
      return res.status(403).json({ error: 'Accès Super Administrateur requis.' });
    }
    const invoiceId = Number(req.params.id);
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!inv) return res.status(404).json({ error: 'Facture introuvable.' });

    const now = new Date();
    const [updatedInv] = await db
      .update(invoices)
      .set({ status: 'PAID', paidAt: now, paymentMethodSummary: 'Validée manuellement (Admin SaaS)' })
      .where(eq(invoices.id, invoiceId))
      .returning();

    const planLimits: Record<string, { maxAgents: number; mrrMonthly: number; mrrAnnual: number }> = {
      STARTER: { maxAgents: 5, mrrMonthly: 7900, mrrAnnual: 6500 },
      BUSINESS: { maxAgents: 25, mrrMonthly: 24900, mrrAnnual: 19900 },
      ENTERPRISE: { maxAgents: 100, mrrMonthly: 59900, mrrAnnual: 49900 },
    };
    const spec = planLimits[inv.plan] || planLimits.BUSINESS;

    await db
      .update(organizations)
      .set({
        plan: inv.plan,
        billingCycle: inv.billingCycle,
        maxAgents: spec.maxAgents,
        mrrCents: inv.billingCycle === 'ANNUAL' ? spec.mrrAnnual : spec.mrrMonthly,
        status: 'ACTIVE',
        nextBillingAt: inv.periodEnd,
      })
      .where(eq(organizations.id, inv.orgId));

    res.json(updatedInv);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de valider la facture.' });
  }
});

router.post('/super-admin/organizations', async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isSuperAdmin) {
      return res.status(403).json({ error: 'Accès Super Administrateur requis.' });
    }
    const { name, industry, plan } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom d’entreprise requis.' });

    const slug = `${String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-4)}`;

    const planMap: Record<string, { mrr: number; maxAgents: number }> = {
      STARTER: { mrr: 7900, maxAgents: 5 },
      BUSINESS: { mrr: 24900, maxAgents: 25 },
      ENTERPRISE: { mrr: 49900, maxAgents: 100 },
    };
    const p = planMap[plan || 'BUSINESS'] || planMap.BUSINESS;

    const [createdOrg] = await db
      .insert(organizations)
      .values({
        name: String(name).trim(),
        slug,
        industry: industry || 'Services B2B',
        plan: plan || 'BUSINESS',
        status: 'ACTIVE',
        mrrCents: p.mrr,
        maxAgents: p.maxAgents,
        portalTitle: `Portail Client — ${name}`,
      })
      .returning();

    // Seed default categories + membership for creator
    await db.insert(memberships).values({
      orgId: createdOrg.id,
      userId: req.dbUser.id,
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
      jobTitle: 'Administrateur Organisation',
    });

    await db.insert(categories).values(
      DEFAULT_CATEGORIES.map((c) => ({
        orgId: createdOrg.id,
        name: c.name,
        subcategories: c.subcategories,
        requestTypes: DEFAULT_REQUEST_TYPES,
        isDefault: true,
      }))
    );

    await db.insert(surveyTemplates).values(buildDefaultSurveyTemplates(createdOrg.id));

    res.status(201).json(createdOrg);
  } catch (error) {
    console.error('Create org error:', error);
    res.status(500).json({ error: 'Impossible de créer l’organisation.' });
  }
});

router.patch('/super-admin/organizations/:id', async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isSuperAdmin) {
      return res.status(403).json({ error: 'Accès Super Administrateur requis.' });
    }
    const id = Number(req.params.id);
    const { status, plan } = req.body;
    const [updated] = await db
      .update(organizations)
      .set({
        ...(status ? { status } : {}),
        ...(plan ? { plan } : {}),
      })
      .where(eq(organizations.id, id))
      .returning();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de modifier l’organisation.' });
  }
});

// ---------------- GEMINI AI COPILOT ----------------
router.post('/ai/analyze-ticket', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const ticketId = Number(req.body.ticketId);
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, oid)))
      .limit(1);
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable.' });

    const [msgs, cats, kbs] = await Promise.all([
      db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, ticket.id)),
      db.select().from(categories).where(eq(categories.orgId, oid)),
      db.select().from(kbArticles).where(eq(kbArticles.orgId, oid)),
    ]);

    const analysis = await analyzeTicketWithAI({
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      description: ticket.description,
      messages: msgs,
      availableCategories: cats.map((c) => c.name),
      kbArticles: kbs,
    });

    await db
      .update(tickets)
      .set({
        aiSentiment: analysis.sentiment || 'Neutre',
        aiUrgencyScore: Number(analysis.urgencyScore) || 50,
        aiSummary: analysis.conversationSummary || '',
        aiRiskFlag: Boolean(analysis.slaRiskWarning),
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticket.id));

    res.json(analysis);
  } catch (error: any) {
    console.error('AI analyze ticket error:', error);
    res.status(500).json({ error: error?.message || 'Erreur lors de l’analyse Gemini AI.' });
  }
});

router.post('/ai/suggest-reply', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const { ticketId, draftToRefine, tone } = req.body;

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, Number(ticketId)), eq(tickets.orgId, oid)))
      .limit(1);
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable.' });

    const [[cust], msgs, kbs] = await Promise.all([
      db.select().from(customers).where(eq(customers.id, ticket.customerId)).limit(1),
      db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, ticket.id)),
      db.select().from(kbArticles).where(and(eq(kbArticles.orgId, oid), eq(kbArticles.category, ticket.category))),
    ]);

    const result = await generateReplySuggestionsWithAI({
      subject: ticket.subject,
      description: ticket.description,
      customerName: cust?.fullName || 'Client',
      companyName: cust?.companyName || '',
      messages: msgs,
      draftToRefine,
      tone,
      kbContext: kbs.map((k) => `${k.title}: ${k.content}`).join('\n'),
    });

    res.json(result);
  } catch (error: any) {
    console.error('AI suggest reply error:', error);
    res.status(500).json({ error: error?.message || 'Erreur génération réponse IA.' });
  }
});

router.post('/ai/insights', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const [[org], orgTickets, orgSurveys] = await Promise.all([
      db.select().from(organizations).where(eq(organizations.id, oid)).limit(1),
      db.select().from(tickets).where(eq(tickets.orgId, oid)).orderBy(desc(tickets.createdAt)).limit(25),
      db.select().from(satisfactionSurveys).where(eq(satisfactionSurveys.orgId, oid)),
    ]);

    const insights = await generateQualityInsightsWithAI({
      orgName: org?.name || 'Organisation',
      ticketStats: orgTickets,
      lowSatisfactionComments: orgSurveys.filter((s) => s.csatScore <= 3),
    });

    res.json(insights);
  } catch (error: any) {
    console.error('AI insights error:', error);
    res.status(500).json({ error: error?.message || 'Erreur synthèse analytique IA.' });
  }
});

export default router;
