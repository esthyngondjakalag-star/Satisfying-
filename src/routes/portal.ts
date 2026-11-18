import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  categories,
  customers,
  kbArticles,
  notifications,
  organizations,
  satisfactionSurveys,
  surveyInvitations,
  surveyTemplates,
  ticketMessages,
  tickets,
} from '../db/schema.ts';
import { ensureOrgCertificationAndSurveys } from '../db/seed.ts';
import { runAutomationsForTicket } from '../services/automation.ts';

const portalRouter = Router();

// Public client survey lookup by invitation token
portalRouter.get('/survey/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    const [invite] = await db
      .select()
      .from(surveyInvitations)
      .where(eq(surveyInvitations.token, token))
      .limit(1);

    if (!invite) {
      return res.status(404).json({ error: 'Lien de sondage introuvable ou expiré.' });
    }

    const [[org], [template], [customer], ticketRow] = await Promise.all([
      db.select().from(organizations).where(eq(organizations.id, invite.orgId)).limit(1),
      db.select().from(surveyTemplates).where(eq(surveyTemplates.id, invite.templateId)).limit(1),
      db.select().from(customers).where(eq(customers.id, invite.customerId)).limit(1),
      invite.ticketId
        ? db.select().from(tickets).where(eq(tickets.id, invite.ticketId)).limit(1)
        : Promise.resolve([]),
    ]);

    if (!org || !template || !customer) {
      return res.status(404).json({ error: 'Données du sondage incomplètes.' });
    }

    const ticket = ticketRow[0] || null;
    res.json({
      invitation: {
        id: invite.id,
        token: invite.token,
        channel: invite.channel,
        status: invite.status,
        sentAt: invite.sentAt,
        completedAt: invite.completedAt,
      },
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        portalTitle: org.portalTitle,
        primaryColor: org.primaryColor,
      },
      template,
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        companyName: customer.companyName,
      },
      ticket: ticket
        ? {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            category: ticket.category,
            subcategory: ticket.subcategory,
            requestType: ticket.requestType,
          }
        : null,
    });
  } catch (error) {
    console.error('Portal survey load error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement du sondage.' });
  }
});

// Submit client survey response
portalRouter.post('/survey/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    const [invite] = await db
      .select()
      .from(surveyInvitations)
      .where(eq(surveyInvitations.token, token))
      .limit(1);

    if (!invite) {
      return res.status(404).json({ error: 'Lien de sondage introuvable.' });
    }
    if (invite.status === 'COMPLETED') {
      return res.status(409).json({ error: 'Ce sondage a déjà été complété. Merci pour votre participation.' });
    }

    const [[template], [customer], ticketRow] = await Promise.all([
      db.select().from(surveyTemplates).where(eq(surveyTemplates.id, invite.templateId)).limit(1),
      db.select().from(customers).where(eq(customers.id, invite.customerId)).limit(1),
      invite.ticketId
        ? db.select().from(tickets).where(eq(tickets.id, invite.ticketId)).limit(1)
        : Promise.resolve([]),
    ]);

    const ticket = ticketRow[0] || null;
    const { csatScore, npsScore, cesScore, customAnswers, comment } = req.body;

    const cleanCsat = Math.min(5, Math.max(1, Number(csatScore) || 5));
    const cleanNps = Math.min(10, Math.max(0, Number(npsScore) ?? 8));
    const cleanCes = Math.min(7, Math.max(1, Number(cesScore) || 6));

    const [createdSurvey] = await db
      .insert(satisfactionSurveys)
      .values({
        orgId: invite.orgId,
        templateId: invite.templateId,
        ticketId: invite.ticketId,
        customerId: invite.customerId,
        agentUserId: ticket?.assignedUserId ?? null,
        agencyId: ticket?.agencyId ?? customer?.agencyId ?? null,
        category: ticket?.category || (template?.targetCategory !== 'ALL' ? template?.targetCategory : 'Service') || 'Service',
        csatScore: cleanCsat,
        npsScore: cleanNps,
        cesScore: cleanCes,
        customAnswers: Array.isArray(customAnswers) ? customAnswers : [],
        comment: String(comment || '').trim(),
      })
      .returning();

    await db
      .update(surveyInvitations)
      .set({ status: 'COMPLETED', completedAt: new Date() })
      .where(eq(surveyInvitations.id, invite.id));

    if (cleanCsat <= 2) {
      await db.insert(notifications).values({
        orgId: invite.orgId,
        type: 'LOW_CSAT',
        title: `Alerte sondage client (${cleanCsat}/5)${ticket ? ` — ${ticket.ticketNumber}` : ''}`,
        message: `${customer?.fullName || 'Client'} : ${comment || 'Insatisfaction signalée dans le sondage client.'}`,
        ticketId: ticket?.id ?? null,
        isRead: false,
      });
    } else {
      await db.insert(notifications).values({
        orgId: invite.orgId,
        type: 'REPORT_READY',
        title: `Nouvelle réponse sondage (${cleanCsat}/5)`,
        message: `${customer?.fullName || 'Client'} a complété le sondage « ${template?.title || 'Satisfaction'} ».`,
        ticketId: ticket?.id ?? null,
        isRead: false,
      });
    }

    res.status(201).json({ success: true, survey: createdSurvey });
  } catch (error) {
    console.error('Portal survey submit error:', error);
    res.status(500).json({ error: 'Erreur lors de l’enregistrement de vos réponses.' });
  }
});

// Public portal configuration + FAQ
portalRouter.get('/:slug', async (req, res) => {
  try {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, req.params.slug))
      .limit(1);

    if (!org) {
      return res.status(404).json({ error: 'Portail client introuvable.' });
    }

    await ensureOrgCertificationAndSurveys(org.id);

    const [orgCats, publicArticles] = await Promise.all([
      db.select().from(categories).where(eq(categories.orgId, org.id)),
      db
        .select()
        .from(kbArticles)
        .where(
          and(
            eq(kbArticles.orgId, org.id),
            eq(kbArticles.visibility, 'PUBLIC'),
            eq(kbArticles.isPublished, true)
          )
        ),
    ]);

    res.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        portalTitle: org.portalTitle,
        primaryColor: org.primaryColor,
      },
      categories: orgCats,
      articles: publicArticles,
    });
  } catch (error) {
    console.error('Portal load error:', error);
    res.status(500).json({ error: 'Erreur chargement portail client.' });
  }
});

// Submit ticket from public portal
portalRouter.post('/:slug/tickets', async (req, res) => {
  try {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, req.params.slug))
      .limit(1);

    if (!org) return res.status(404).json({ error: 'Organisation introuvable.' });

    const { fullName, email, companyName, subject, description, category, subcategory, requestType, priority } = req.body;
    if (!fullName || !email || !subject || !description) {
      return res.status(400).json({ error: 'Veuillez renseigner votre nom, email, sujet et description.' });
    }

    let [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, org.id), eq(customers.email, String(email).trim())))
      .limit(1);

    if (!customer) {
      [customer] = await db
        .insert(customers)
        .values({
          orgId: org.id,
          externalCode: `CLI-${Math.floor(1000 + Math.random() * 8999)}`,
          fullName: String(fullName).trim(),
          email: String(email).trim(),
          companyName: companyName || 'Client Portail',
          customerType: 'PME',
        })
        .returning();
    }

    const existingTickets = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.orgId, org.id));
    const ticketNumber = `CP-2026-${String(existingTickets.length + 101).padStart(4, '0')}`;

    const [created] = await db
      .insert(tickets)
      .values({
        orgId: org.id,
        ticketNumber,
        subject: String(subject).trim(),
        description: String(description).trim(),
        customerId: customer.id,
        category: category || 'Réclamation générale',
        subcategory: subcategory || 'Général',
        requestType: requestType || 'Réclamation',
        channel: 'WEB_FORM',
        priority: priority || 'NORMALE',
        status: 'NOUVEAU',
        firstResponseDueAt: new Date(Date.now() + 4 * 3600000),
        resolutionDueAt: new Date(Date.now() + 24 * 3600000),
      })
      .returning();

    await db.insert(ticketMessages).values({
      orgId: org.id,
      ticketId: created.id,
      authorType: 'CUSTOMER',
      authorName: customer.fullName,
      body: created.description,
      isInternalNote: false,
      attachments: [],
    });

    await db.insert(notifications).values({
      orgId: org.id,
      type: 'NEW_TICKET',
      title: `Portail Client : ${ticketNumber}`,
      message: `${customer.fullName} a déposé une demande : ${created.subject}`,
      ticketId: created.id,
      isRead: false,
    });

    await runAutomationsForTicket(org.id, created.id, 'TICKET_CREATED', customer.customerType);

    res.status(201).json({ ticketNumber: created.ticketNumber, id: created.id });
  } catch (error) {
    console.error('Portal create ticket error:', error);
    res.status(500).json({ error: 'Erreur lors de la soumission.' });
  }
});

// Track ticket by ticketNumber + email
portalRouter.get('/:slug/track', async (req, res) => {
  try {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, req.params.slug))
      .limit(1);

    if (!org) return res.status(404).json({ error: 'Organisation introuvable.' });

    const ticketNumber = String(req.query.ticketNumber || '').trim();
    const email = String(req.query.email || '').trim().toLowerCase();

    if (!ticketNumber || !email) {
      return res.status(400).json({ error: 'Numéro de ticket et email requis.' });
    }

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.orgId, org.id), eq(tickets.ticketNumber, ticketNumber)))
      .limit(1);

    if (!ticket) return res.status(404).json({ error: 'Dossier introuvable.' });

    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, ticket.customerId))
      .limit(1);

    if (!customer || customer.email.toLowerCase() !== email) {
      return res.status(403).json({ error: 'L’adresse email ne correspond pas à ce dossier.' });
    }

    const msgs = await db
      .select()
      .from(ticketMessages)
      .where(and(eq(ticketMessages.ticketId, ticket.id), eq(ticketMessages.isInternalNote, false)));

    res.json({ ticket, customer, messages: msgs });
  } catch (error) {
    res.status(500).json({ error: 'Erreur suivi dossier.' });
  }
});

// Customer reply or resolution confirmation
portalRouter.post('/:slug/track/reply', async (req, res) => {
  try {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, req.params.slug))
      .limit(1);
    if (!org) return res.status(404).json({ error: 'Organisation introuvable.' });

    const { ticketNumber, email, body, confirmResolution, csatScore, npsScore, cesScore, comment } = req.body;

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.orgId, org.id), eq(tickets.ticketNumber, ticketNumber)))
      .limit(1);

    if (!ticket) return res.status(404).json({ error: 'Dossier introuvable.' });
    const [customer] = await db.select().from(customers).where(eq(customers.id, ticket.customerId)).limit(1);
    if (!customer || customer.email.toLowerCase() !== String(email).toLowerCase()) {
      return res.status(403).json({ error: 'Accès refusé.' });
    }

    if (body && String(body).trim()) {
      await db.insert(ticketMessages).values({
        orgId: org.id,
        ticketId: ticket.id,
        authorType: 'CUSTOMER',
        authorName: customer.fullName,
        body: String(body).trim(),
        isInternalNote: false,
        attachments: [],
      });

      await db.insert(notifications).values({
        orgId: org.id,
        type: 'NEW_MESSAGE',
        title: `Réponse client — ${ticket.ticketNumber}`,
        message: String(body).slice(0, 90),
        ticketId: ticket.id,
        isRead: false,
      });
    }

    if (confirmResolution) {
      await db
        .update(tickets)
        .set({ status: 'CLOTURE', closedAt: new Date(), updatedAt: new Date() })
        .where(eq(tickets.id, ticket.id));
    }

    if (csatScore) {
      await db.insert(satisfactionSurveys).values({
        orgId: org.id,
        ticketId: ticket.id,
        customerId: customer.id,
        agentUserId: ticket.assignedUserId,
        agencyId: ticket.agencyId,
        category: ticket.category,
        csatScore: Number(csatScore),
        npsScore: Number(npsScore ?? 8),
        cesScore: Number(cesScore ?? 5),
        comment: comment || '',
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur réponse portail.' });
  }
});

export default portalRouter;
