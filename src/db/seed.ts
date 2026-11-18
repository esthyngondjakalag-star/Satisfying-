import { and, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  organizations,
  agencies,
  teams,
  users,
  memberships,
  categories,
  slaPolicies,
  customers,
  tickets,
  ticketMessages,
  satisfactionSurveys,
  surveyTemplates,
  surveyInvitations,
  automationRules,
  kbArticles,
  notifications,
  activityLogs,
  invoices,
} from './schema.ts';

export const DEFAULT_REQUEST_TYPES = [
  'Demande de certification',
  'Audit / Conformité',
  'Garantie / SAV',
  'Réclamation',
  'Incident technique',
  'Demande de remboursement',
  'Formation & Onboarding',
  'Renouvellement',
  'Demande d’information',
];

export const DEFAULT_CATEGORIES = [
  {
    name: 'Certification',
    subcategories: [
      'Délivrance certificat / attestation',
      'Renouvellement certification',
      'Audit & conformité',
      'Erreur sur certificat',
      'Homologation & accréditation',
      'Requalification dossier',
    ],
  },
  {
    name: 'Produit',
    subcategories: ['Défaut matériel', 'Garantie constructeur', 'Conformité', 'Pièces détachées', 'Notice & Accessoires'],
  },
  {
    name: 'Service',
    subcategories: ['Accueil', 'Délai intervention', 'Suivi dossier', 'Qualité prestation', 'Maintenance préventive'],
  },
  {
    name: 'Facturation',
    subcategories: ['Erreur facture', 'Avoir / TVA', 'Prélèvement', 'Échéancier & Relance', 'Devis vs Facture'],
  },
  {
    name: 'Livraison',
    subcategories: ['Retard transporteur', 'Colis endommagé', 'Colis incomplet', 'Erreur adresse / hub', 'Retour SAV'],
  },
  {
    name: 'Support technique',
    subcategories: ['Accès & SSO', 'Bug applicatif', 'Performance API', 'Configuration & Réseau', 'Mise à jour firmware'],
  },
  {
    name: 'Personnel',
    subcategories: ['Comportement', 'Disponibilité', 'Expertise', 'Suivi conseiller'],
  },
  {
    name: 'Inscription',
    subcategories: ['Activation compte', 'Validation KYC', 'Contrat & Mandat', 'Dossier administratif'],
  },
  {
    name: 'Formation',
    subcategories: ['Onboarding', 'Atelier équipe', 'Certification apprenant', 'Support pédagogique', 'Documentation'],
  },
  {
    name: 'Remboursement',
    subcategories: ['Remboursement total', 'Geste commercial', 'Annulation', 'Pénalité SLA'],
  },
  {
    name: 'Réclamation générale',
    subcategories: ['Qualité globale', 'Direction', 'Litige contractuel', 'Médiation'],
  },
];

export function buildDefaultSurveyTemplates(orgId: number) {
  return [
    {
      orgId,
      title: 'Sondage Satisfaction Post-Certification',
      description: 'Évaluation de la qualité de traitement, des audits et de la délivrance des certificats.',
      targetCategory: 'Certification',
      includeCsat: true,
      includeNps: true,
      includeCes: true,
      questions: [
        {
          id: 'q-cert-delai',
          label: 'Respect des délais de délivrance de votre certificat / attestation',
          type: 'RATING_5' as const,
          required: true,
        },
        {
          id: 'q-cert-audit',
          label: 'Clarté des critères d’audit et accompagnement de notre référent certification',
          type: 'RATING_5' as const,
          required: true,
        },
        {
          id: 'q-cert-exploitable',
          label: 'Le certificat délivré était-il immédiatement conforme sans rectification ?',
          type: 'YES_NO' as const,
          required: true,
        },
        {
          id: 'q-cert-amelioration',
          label: 'Quelles améliorations recommandez-vous pour nos services de certification ?',
          type: 'TEXT' as const,
          required: false,
        },
      ],
      isActive: true,
    },
    {
      orgId,
      title: 'Enquête Qualité SAV & Réclamations',
      description: 'Mesure CSAT / NPS / CES après clôture ou résolution d’une demande après-vente.',
      targetCategory: 'ALL',
      includeCsat: true,
      includeNps: true,
      includeCes: true,
      questions: [
        {
          id: 'q-sav-ecoute',
          label: 'Qualité d’écoute et rapidité de prise en charge par votre conseiller',
          type: 'RATING_5' as const,
          required: true,
        },
        {
          id: 'q-sav-resolu',
          label: 'Votre demande a-t-elle été résolue de façon définitive dès le premier traitement ?',
          type: 'YES_NO' as const,
          required: true,
        },
        {
          id: 'q-sav-comment',
          label: 'Un commentaire pour aider nos équipes à s’améliorer ?',
          type: 'TEXT' as const,
          required: false,
        },
      ],
      isActive: true,
    },
    {
      orgId,
      title: 'Évaluation Formation & Onboarding',
      description: 'Questionnaire destiné aux équipes formées et certifiées sur nos solutions.',
      targetCategory: 'Formation',
      includeCsat: true,
      includeNps: true,
      includeCes: false,
      questions: [
        {
          id: 'q-form-maitrise',
          label: 'Niveau d’autonomie acquis à l’issue de la session',
          type: 'RATING_5' as const,
          required: true,
        },
        {
          id: 'q-form-supports',
          label: 'Qualité des supports pédagogiques et exercices pratiques',
          type: 'RATING_5' as const,
          required: true,
        },
      ],
      isActive: true,
    },
  ];
}

export async function ensureOrgCertificationAndSurveys(orgId: number) {
  try {
    const existingCats = await db.select().from(categories).where(eq(categories.orgId, orgId));
    const existingNames = new Set(existingCats.map((c) => c.name.toLowerCase()));

    const missingCats = DEFAULT_CATEGORIES.filter((c) => !existingNames.has(c.name.toLowerCase()));
    if (missingCats.length > 0) {
      await db.insert(categories).values(
        missingCats.map((c) => ({
          orgId,
          name: c.name,
          subcategories: c.subcategories,
          requestTypes: DEFAULT_REQUEST_TYPES,
          isDefault: true,
        }))
      );
    }

    const existingTemplates = await db
      .select()
      .from(surveyTemplates)
      .where(eq(surveyTemplates.orgId, orgId));

    let templatesToUse = existingTemplates;
    if (existingTemplates.length === 0) {
      templatesToUse = await db
        .insert(surveyTemplates)
        .values(buildDefaultSurveyTemplates(orgId))
        .returning();
    }

    // Backfill certification tickets & demo survey invitations for existing demo org if absent
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (org && org.slug === 'horizon-distribution-demo') {
      const orgTickets = await db.select().from(tickets).where(eq(tickets.orgId, orgId));
      const hasCertTicket = orgTickets.some((t) => t.category === 'Certification');
      const orgCustomers = await db.select().from(customers).where(eq(customers.orgId, orgId));
      const orgAgencies = await db.select().from(agencies).where(eq(agencies.orgId, orgId));
      const orgTeams = await db.select().from(teams).where(eq(teams.orgId, orgId));
      const orgMembers = await db.select().from(memberships).where(eq(memberships.orgId, orgId));

      let certResolvedTicketId: number | null =
        orgTickets.find((t) => t.category === 'Certification' && t.status === 'RESOLU')?.id ?? null;

      if (!hasCertTicket && orgCustomers.length > 0) {
        const now = Date.now();
        const ago = (h: number) => new Date(now - h * 3600 * 1000);
        const hours = (h: number) => new Date(now + h * 3600 * 1000);
        const custA = orgCustomers[1] || orgCustomers[0];
        const custB = orgCustomers[4] || orgCustomers[0];
        const ag = orgAgencies[0]?.id ?? null;
        const tm = orgTeams[2]?.id ?? orgTeams[0]?.id ?? null;
        const assignee = orgMembers[1]?.userId ?? orgMembers[0]?.userId ?? null;

        const insertedCertTickets = await db
          .insert(tickets)
          .values([
            {
              orgId,
              ticketNumber: 'CP-2026-0113',
              subject: 'Renouvellement certification ISO-9001 & audit conformité site Lyon',
              description:
                'Dossier de renouvellement annuel déposé avec rapport d’audit interne. Attente de validation finale du référent certification.',
              customerId: custA.id,
              category: 'Certification',
              subcategory: 'Audit & conformité',
              requestType: 'Audit / Conformité',
              channel: 'WEB_FORM',
              priority: 'ELEVEE',
              status: 'EN_COURS',
              agencyId: ag,
              teamId: tm,
              assignedUserId: assignee,
              tags: ['Certification', 'Audit ISO'],
              rootCause: 'Processus défaillant',
              solutionSummary: 'Vérification des pièces réglementaires en cours.',
              firstResponseAt: ago(4),
              firstResponseDueAt: ago(3),
              resolutionDueAt: hours(5),
              slaBreached: false,
              aiSentiment: 'Neutre',
              aiUrgencyScore: 65,
              aiSummary: 'Dossier de renouvellement de certification en cours d’audit réglementaire.',
              aiRiskFlag: false,
              createdAt: ago(6),
              updatedAt: ago(1),
            },
            {
              orgId,
              ticketNumber: 'CP-2026-0114',
              subject: 'Délivrance attestation de conformité & homologation Médipôle Sud',
              description:
                'Suite à la recette technique, merci de délivrer le certificat d’homologation signé pour nos services qualité.',
              customerId: custB.id,
              category: 'Certification',
              subcategory: 'Délivrance certificat / attestation',
              requestType: 'Demande de certification',
              channel: 'EMAIL',
              priority: 'NORMALE',
              status: 'RESOLU',
              agencyId: ag,
              teamId: tm,
              assignedUserId: assignee,
              tags: ['Attestation', 'Homologation'],
              rootCause: 'Non définie',
              solutionSummary: 'Certificat signé n° CERT-2026-884 généré et transmis.',
              firstResponseAt: ago(14),
              firstResponseDueAt: ago(12),
              resolutionDueAt: ago(2),
              resolvedAt: ago(3),
              slaBreached: false,
              aiSentiment: 'Positif',
              aiUrgencyScore: 22,
              aiSummary: 'Attestation d’homologation émise dans les délais SLA.',
              aiRiskFlag: false,
              createdAt: ago(18),
              updatedAt: ago(3),
            },
          ])
          .returning();

        certResolvedTicketId = insertedCertTickets[1]?.id ?? null;

        if (certResolvedTicketId && templatesToUse[0]) {
          await db.insert(satisfactionSurveys).values({
            orgId,
            templateId: templatesToUse[0].id,
            ticketId: certResolvedTicketId,
            customerId: custB.id,
            agentUserId: assignee,
            agencyId: ag,
            category: 'Certification',
            csatScore: 5,
            npsScore: 10,
            cesScore: 6,
            customAnswers: [
              { questionId: 'q-cert-delai', label: 'Respect des délais de délivrance', answer: '5 / 5' },
              { questionId: 'q-cert-exploitable', label: 'Certificat conforme sans rectification', answer: 'Oui' },
            ],
            comment: 'Délivrance très rapide du certificat d’homologation, parfait pour notre audit.',
            submittedAt: ago(2),
          });
        }
      }

      const existingInvites = await db
        .select()
        .from(surveyInvitations)
        .where(eq(surveyInvitations.orgId, orgId));

      if (existingInvites.length === 0 && templatesToUse.length > 0 && orgCustomers.length > 0) {
        const certTpl = templatesToUse.find((t) => t.targetCategory === 'Certification') || templatesToUse[0];
        const savTpl = templatesToUse.find((t) => t.targetCategory === 'ALL') || templatesToUse[0];
        const cust1 = orgCustomers[0];
        const cust2 = orgCustomers[1] || orgCustomers[0];
        const resolvedTicket = orgTickets.find((t) => t.status === 'RESOLU') || orgTickets[0];

        await db
          .insert(surveyInvitations)
          .values([
            {
              orgId,
              token: 'sondage-certif-demo-2026',
              templateId: certTpl.id,
              ticketId: certResolvedTicketId || resolvedTicket?.id || null,
              customerId: cust2.id,
              channel: 'EMAIL',
              status: 'SENT',
            },
            {
              orgId,
              token: 'sondage-sav-demo-2026',
              templateId: savTpl.id,
              ticketId: resolvedTicket?.id || null,
              customerId: cust1.id,
              channel: 'LINK',
              status: 'SENT',
            },
          ])
          .onConflictDoNothing();
      }

      const existingInvoices = await db.select().from(invoices).where(eq(invoices.orgId, orgId));
      if (existingInvoices.length === 0) {
        const start = new Date();
        const end = new Date(start.getTime() + 365 * 86400000);
        await db
          .insert(invoices)
          .values({
            orgId,
            invoiceNumber: 'FAC-2026-0001',
            plan: 'ENTERPRISE',
            billingCycle: 'ANNUAL',
            amountCents: 49900 * 12,
            taxCents: Math.round(49900 * 12 * 0.2),
            totalCents: Math.round(49900 * 12 * 1.2),
            currency: 'EUR',
            status: 'PAID',
            paymentProvider: 'CARD',
            paymentMethodSummary: 'Visa Corporate •••• 4242',
            periodStart: start,
            periodEnd: end,
            paidAt: start,
          })
          .onConflictDoNothing();

        if (!org.billingEmail) {
          await db
            .update(organizations)
            .set({
              billingEmail: 'comptabilite@horizon-distribution.fr',
              paymentMethodBrand: 'Visa Corporate',
              paymentMethodLast4: '4242',
              nextBillingAt: end,
            })
            .where(eq(organizations.id, orgId));
        }
      }
    }
  } catch (err) {
    console.error('Error in ensureOrgCertificationAndSurveys:', err);
  }
}

export async function ensureDemoDataForUser(user: typeof users.$inferSelect) {
  try {
    // Check if user already has any membership
    const existingMems = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .limit(1);

    if (existingMems.length > 0) {
      return existingMems[0].orgId;
    }

    // Check if demo org already exists (e.g. another user signed in before)
    const existingOrgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'horizon-distribution-demo'))
      .limit(1);

    if (existingOrgs.length > 0) {
      const primaryOrg = existingOrgs[0];
      const primaryAgencies = await db
        .select()
        .from(agencies)
        .where(eq(agencies.orgId, primaryOrg.id))
        .limit(1);
      const primaryTeams = await db
        .select()
        .from(teams)
        .where(eq(teams.orgId, primaryOrg.id))
        .limit(1);

      await db
        .insert(memberships)
        .values({
          orgId: primaryOrg.id,
          userId: user.id,
          agencyId: primaryAgencies[0]?.id ?? null,
          teamId: primaryTeams[0]?.id ?? null,
          role: 'ORG_ADMIN',
          status: 'ACTIVE',
          maxLoad: 20,
          jobTitle: 'Directeur Relation Client',
        })
        .onConflictDoNothing();

      return primaryOrg.id;
    }

    // Seed full demo organizations cleanly
    const [org1] = await db
      .insert(organizations)
      .values({
        name: 'Horizon Distribution & SAV [DÉMO]',
        slug: 'horizon-distribution-demo',
        industry: 'Distribution B2B & Équipements',
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
        billingCycle: 'ANNUAL',
        mrrCents: 49900,
        maxAgents: 50,
        primaryColor: '#2563EB',
        portalTitle: 'Portail Service Client — Horizon Distribution',
      })
      .returning();

    const [org2] = await db
      .insert(organizations)
      .values({
        name: 'Veloce Mobility Services [DÉMO]',
        slug: 'veloce-mobility-demo',
        industry: 'Mobilité & Flottes Entreprises',
        plan: 'BUSINESS',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        mrrCents: 24900,
        maxAgents: 25,
        primaryColor: '#0F766E',
        portalTitle: 'Assistance Flotte Veloce',
      })
      .returning();

    await db.insert(organizations).values({
      name: 'Atelier Nord Commerce [DÉMO]',
      slug: 'atelier-nord-demo',
      industry: 'Retail Spécialisé',
      plan: 'STARTER',
      status: 'TRIAL',
      billingCycle: 'MONTHLY',
      mrrCents: 7900,
      maxAgents: 5,
      primaryColor: '#4338CA',
      portalTitle: 'Support Atelier Nord',
      trialEndsAt: new Date(Date.now() + 12 * 24 * 3600 * 1000),
    });

    // Agencies for Org 1
    const [agParis, agLyon, agBordeaux] = await db
      .insert(agencies)
      .values([
        {
          orgId: org1.id,
          name: 'Agence Paris Nord',
          code: 'PAR-01',
          city: 'Paris',
          country: 'France',
          managerName: 'Claire Moreau',
        },
        {
          orgId: org1.id,
          name: 'Agence Lyon Part-Dieu',
          code: 'LYO-02',
          city: 'Lyon',
          country: 'France',
          managerName: 'Thomas Bernard',
        },
        {
          orgId: org1.id,
          name: 'Agence Bordeaux Atlantique',
          code: 'BOD-03',
          city: 'Bordeaux',
          country: 'France',
          managerName: 'Nadia Khelifi',
        },
      ])
      .returning();

    // Teams for Org 1
    const [teamN1, teamLitiges, teamTech] = await db
      .insert(teams)
      .values([
        {
          orgId: org1.id,
          agencyId: agParis.id,
          name: 'Support Niveau 1',
          description: 'Qualification initiale, demandes rapides et orientation omnicanale.',
          leadName: 'Thomas Bernard',
        },
        {
          orgId: org1.id,
          agencyId: agLyon.id,
          name: 'Réclamations & Litiges',
          description: 'Gestion des litiges livraison, facturation et gestes commerciaux.',
          leadName: 'Claire Moreau',
        },
        {
          orgId: org1.id,
          agencyId: agBordeaux.id,
          name: 'Expertise Technique & Qualité',
          description: 'Incidents produits critiques, escalades fournisseurs et analyses racines.',
          leadName: 'Nadia Khelifi',
        },
      ])
      .returning();

    // Demo team users
    const [agentClaire, agentThomas, agentNadia, agentMarc] = await db
      .insert(users)
      .values([
        {
          uid: 'demo-claire-moreau',
          email: 'claire.moreau@horizon-demo.fr',
          fullName: 'Claire Moreau',
          avatarUrl: '/src/assets/images/avatar_director_claire_1795000474272.jpg',
          isSuperAdmin: false,
        },
        {
          uid: 'demo-thomas-bernard',
          email: 'thomas.bernard@horizon-demo.fr',
          fullName: 'Thomas Bernard',
          avatarUrl: '/src/assets/images/avatar_lead_thomas_1795000474970.jpg',
          isSuperAdmin: false,
        },
        {
          uid: 'demo-nadia-khelifi',
          email: 'nadia.khelifi@horizon-demo.fr',
          fullName: 'Nadia Khelifi',
          avatarUrl: '/src/assets/images/avatar_analyst_nadia_1795000474646.jpg',
          isSuperAdmin: false,
        },
        {
          uid: 'demo-marc-lefevre',
          email: 'marc.lefevre@horizon-demo.fr',
          fullName: 'Marc Lefèvre',
          avatarUrl: null,
          isSuperAdmin: false,
        },
      ])
      .onConflictDoNothing()
      .returning();

    // Fetch if already existed
    const allDemoUsers =
      agentClaire && agentThomas && agentNadia && agentMarc
        ? [agentClaire, agentThomas, agentNadia, agentMarc]
        : await db.select().from(users);

    const claire = allDemoUsers.find((u) => u.uid === 'demo-claire-moreau') || user;
    const thomas = allDemoUsers.find((u) => u.uid === 'demo-thomas-bernard') || user;
    const nadia = allDemoUsers.find((u) => u.uid === 'demo-nadia-khelifi') || user;
    const marc = allDemoUsers.find((u) => u.uid === 'demo-marc-lefevre') || user;

    await db
      .insert(memberships)
      .values([
        {
          orgId: org1.id,
          userId: user.id,
          agencyId: agParis.id,
          teamId: teamLitiges.id,
          role: 'ORG_ADMIN',
          status: 'ACTIVE',
          maxLoad: 20,
          jobTitle: 'Directeur Qualité & Relation Client',
        },
        {
          orgId: org1.id,
          userId: claire.id,
          agencyId: agParis.id,
          teamId: teamLitiges.id,
          role: 'CS_MANAGER',
          status: 'ACTIVE',
          maxLoad: 18,
          jobTitle: 'Responsable Service Client',
        },
        {
          orgId: org1.id,
          userId: thomas.id,
          agencyId: agLyon.id,
          teamId: teamN1.id,
          role: 'AGENT',
          status: 'ACTIVE',
          maxLoad: 16,
          jobTitle: 'Référent Support Omnicanal',
        },
        {
          orgId: org1.id,
          userId: nadia.id,
          agencyId: agBordeaux.id,
          teamId: teamTech.id,
          role: 'ANALYST',
          status: 'ACTIVE',
          maxLoad: 10,
          jobTitle: 'Analyste Qualité & SLA',
        },
        {
          orgId: org1.id,
          userId: marc.id,
          agencyId: agLyon.id,
          teamId: teamLitiges.id,
          role: 'AGENT',
          status: 'ACTIVE',
          maxLoad: 14,
          jobTitle: 'Gestionnaire Réclamations',
        },
        {
          orgId: org2.id,
          userId: user.id,
          role: 'ORG_ADMIN',
          status: 'ACTIVE',
          maxLoad: 20,
          jobTitle: 'Administrateur Groupe',
        },
      ])
      .onConflictDoNothing();

    // Categories for Org 1 & Org 2
    for (const org of [org1, org2]) {
      await db.insert(categories).values(
        DEFAULT_CATEGORIES.map((c) => ({
          orgId: org.id,
          name: c.name,
          subcategories: c.subcategories,
          requestTypes: DEFAULT_REQUEST_TYPES,
          isDefault: true,
        }))
      );
      if (org.id === org2.id) {
        await db.insert(surveyTemplates).values(buildDefaultSurveyTemplates(org.id));
      }
    }

    // SLA Policies for Org 1
    await db.insert(slaPolicies).values([
      {
        orgId: org1.id,
        name: 'SLA Critique — Grands Comptes & Pannes',
        priority: 'CRITIQUE',
        categoryName: 'ALL',
        customerType: 'ALL',
        firstResponseMinutes: 15,
        resolutionMinutes: 120,
        escalateAtPercent: 75,
        businessHoursOnly: false,
      },
      {
        orgId: org1.id,
        name: 'SLA Urgente — Incidents Opérationnels',
        priority: 'URGENTE',
        categoryName: 'ALL',
        customerType: 'ALL',
        firstResponseMinutes: 30,
        resolutionMinutes: 240,
        escalateAtPercent: 80,
        businessHoursOnly: true,
      },
      {
        orgId: org1.id,
        name: 'SLA Élevée — Réclamations Prioritaires',
        priority: 'ELEVEE',
        categoryName: 'ALL',
        customerType: 'ALL',
        firstResponseMinutes: 60,
        resolutionMinutes: 480,
        escalateAtPercent: 80,
        businessHoursOnly: true,
      },
      {
        orgId: org1.id,
        name: 'SLA Normale — Standard B2B',
        priority: 'NORMALE',
        categoryName: 'ALL',
        customerType: 'ALL',
        firstResponseMinutes: 240,
        resolutionMinutes: 1440,
        escalateAtPercent: 85,
        businessHoursOnly: true,
      },
      {
        orgId: org1.id,
        name: 'SLA Faible — Demandes Information',
        priority: 'FAIBLE',
        categoryName: 'ALL',
        customerType: 'ALL',
        firstResponseMinutes: 480,
        resolutionMinutes: 2880,
        escalateAtPercent: 90,
        businessHoursOnly: true,
      },
    ]);

    // Customers for Org 1
    const [cust1, cust2, cust3, cust4, cust5, cust6] = await db
      .insert(customers)
      .values([
        {
          orgId: org1.id,
          externalCode: 'CLI-9041',
          fullName: 'Sophie Valéry',
          email: 's.valery@groupe-mercure.fr',
          phone: '+33 6 14 28 90 12',
          companyName: 'Groupe Mercure Logistics',
          customerType: 'VIP',
          agencyId: agParis.id,
          totalSpentCents: 14850000,
          purchases: [
            { ref: 'CMD-2026-881', item: 'Lot 24 Terminaux Scanner Pro', amountCents: 4850000, date: '2026-10-14' },
            { ref: 'CMD-2026-412', item: 'Contrat Maintenance Annuel Gold', amountCents: 10000000, date: '2026-06-02' },
          ],
          tags: ['Grand Compte', 'Renouvellement Q4'],
          internalNotes: 'Compte stratégique sensible aux délais de livraison sur le hub Paris Nord.',
          registeredAt: new Date('2024-03-11'),
        },
        {
          orgId: org1.id,
          externalCode: 'CLI-8824',
          fullName: 'Antoine Delacroix',
          email: 'a.delacroix@atelier-rhone.com',
          phone: '+33 6 72 41 09 33',
          companyName: 'Atelier du Rhône SAS',
          customerType: 'ENTERPRISE',
          agencyId: agLyon.id,
          totalSpentCents: 6420000,
          purchases: [
            { ref: 'CMD-2026-790', item: 'Station Assemblage Modulaire V4', amountCents: 4200000, date: '2026-11-01' },
            { ref: 'CMD-2026-305', item: 'Kit Capteurs Industriels x12', amountCents: 2220000, date: '2026-04-18' },
          ],
          tags: ['Industrie', 'Multi-sites'],
          internalNotes: 'Demande systématiquement un accusé de réception détaillé avec numéro de lot.',
          registeredAt: new Date('2024-09-20'),
        },
        {
          orgId: org1.id,
          externalCode: 'CLI-7712',
          fullName: 'Camille Deschamps',
          email: 'camille@bistro-aquitaine.fr',
          phone: '+33 6 55 18 44 21',
          companyName: 'Bistro Aquitaine',
          customerType: 'PME',
          agencyId: agBordeaux.id,
          totalSpentCents: 1840000,
          purchases: [
            { ref: 'CMD-2026-845', item: 'Système Encaissement Tactile Dual', amountCents: 1840000, date: '2026-10-29' },
          ],
          tags: ['Restauration'],
          internalNotes: 'Préfère être contactée par WhatsApp ou téléphone avant 11h.',
          registeredAt: new Date('2025-02-04'),
        },
        {
          orgId: org1.id,
          externalCode: 'CLI-6509',
          fullName: 'Julien Marchand',
          email: 'j.marchand@optique-centrale.fr',
          phone: '+33 6 89 33 17 60',
          companyName: 'Optique Centrale',
          customerType: 'PME',
          agencyId: agParis.id,
          totalSpentCents: 920000,
          purchases: [
            { ref: 'CMD-2026-733', item: 'Abonnement Logiciel Gestion Stock', amountCents: 920000, date: '2026-09-12' },
          ],
          tags: ['Facturation récurrente'],
          internalNotes: '',
          registeredAt: new Date('2025-07-19'),
        },
        {
          orgId: org1.id,
          externalCode: 'CLI-5930',
          fullName: 'Élodie Garnier',
          email: 'e.garnier@medipole-sud.fr',
          phone: '+33 6 31 04 82 55',
          companyName: 'Médipôle Sud',
          customerType: 'ENTERPRISE',
          agencyId: agBordeaux.id,
          totalSpentCents: 8950000,
          purchases: [
            { ref: 'CMD-2026-892', item: 'Unité Réfrigérée Connectée M-200', amountCents: 8950000, date: '2026-11-10' },
          ],
          tags: ['Santé', 'Haute Exigence SLA'],
          internalNotes: 'Contrat incluant pénalités de retard au-delà de 4h sur incident critique.',
          registeredAt: new Date('2023-11-05'),
        },
        {
          orgId: org1.id,
          externalCode: 'CLI-4120',
          fullName: 'Lucas Perrot',
          email: 'lucas.perrot@gmail.com',
          phone: '+33 7 61 90 12 04',
          companyName: 'Particulier',
          customerType: 'PARTICULIER',
          agencyId: agLyon.id,
          totalSpentCents: 245000,
          purchases: [
            { ref: 'CMD-2026-811', item: 'Module Domotique Compact', amountCents: 245000, date: '2026-10-22' },
          ],
          tags: ['E-commerce'],
          internalNotes: '',
          registeredAt: new Date('2026-01-15'),
        },
      ])
      .returning();

    const now = Date.now();
    const hours = (h: number) => new Date(now + h * 3600 * 1000);
    const ago = (h: number) => new Date(now - h * 3600 * 1000);

    // Seed 12 rich Tickets covering statuses, priorities, channels, root causes, SLA risk
    const insertedTickets = await db
      .insert(tickets)
      .values([
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0101',
          subject: 'Panne bloc alimentation sur 6 terminaux Scanner Pro (Lot #881)',
          description:
            'Depuis ce matin 07h30, 6 des 24 terminaux livrés sur notre entrepôt Paris Nord ne s’allument plus après mise en charge. Blocage total de la chaîne de préparation.',
          customerId: cust1.id,
          category: 'Produit',
          subcategory: 'Défaut matériel',
          requestType: 'Incident technique',
          channel: 'EMAIL',
          priority: 'CRITIQUE',
          status: 'ESCALADE',
          agencyId: agParis.id,
          teamId: teamTech.id,
          assignedUserId: claire.id,
          tags: ['Lot #881', 'Entrepôt bloqué', 'VIP'],
          rootCause: 'Défaut produit',
          solutionSummary: 'Expédition express de 6 blocs de remplacement + audit fournisseur sur le lot.',
          firstResponseAt: ago(1.8),
          firstResponseDueAt: ago(1.5),
          resolutionDueAt: hours(0.7), // SLA at risk (< 1h left)
          slaBreached: false,
          reopenCount: 0,
          aiSentiment: 'Très négatif',
          aiUrgencyScore: 96,
          aiSummary: 'Incident critique bloquant 6 scanners sur entrepôt VIP Paris Nord. Risque de rupture SLA imminent.',
          aiRiskFlag: true,
          createdAt: ago(2),
          updatedAt: ago(0.2),
        },
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0102',
          subject: 'Double prélèvement constaté sur facture FAC-2026-1094',
          description:
            'Nous avons été débités deux fois de 2 450 € HT le 14 novembre pour le renouvellement de notre licence annuelle. Merci de procéder au remboursement immédiat.',
          customerId: cust4.id,
          category: 'Facturation',
          subcategory: 'Prélèvement',
          requestType: 'Demande de remboursement',
          channel: 'WEB_FORM',
          priority: 'URGENTE',
          status: 'EN_COURS',
          agencyId: agParis.id,
          teamId: teamLitiges.id,
          assignedUserId: marc.id,
          tags: ['Double débit', 'Comptabilité'],
          rootCause: 'Problème de facturation',
          solutionSummary: '',
          firstResponseAt: ago(3),
          firstResponseDueAt: ago(2.5),
          resolutionDueAt: ago(0.5), // Already breached!
          slaBreached: true,
          reopenCount: 0,
          aiSentiment: 'Négatif',
          aiUrgencyScore: 88,
          aiSummary: 'Double prélèvement de 2 450 € HT détecté. SLA de résolution dépassé, action comptable requise.',
          aiRiskFlag: true,
          createdAt: ago(5),
          updatedAt: ago(0.5),
        },
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0103',
          subject: 'Colis incomplet : manque câble secteur et sonde thermique M-200',
          description:
            'À la réception de notre unité réfrigérée M-200 ce matin, le carton d’accessoires était ouvert et il manque la sonde de température calibrée.',
          customerId: cust5.id,
          category: 'Livraison',
          subcategory: 'Colis incomplet',
          requestType: 'Réclamation',
          channel: 'PHONE',
          priority: 'CRITIQUE',
          status: 'ASSIGNE',
          agencyId: agBordeaux.id,
          teamId: teamLitiges.id,
          assignedUserId: thomas.id,
          tags: ['Chaîne du froid', 'Accessoire manquant'],
          rootCause: 'Processus défaillant',
          solutionSummary: '',
          firstResponseAt: ago(0.8),
          firstResponseDueAt: ago(0.75),
          resolutionDueAt: hours(1.1),
          slaBreached: false,
          reopenCount: 0,
          aiSentiment: 'Négatif',
          aiUrgencyScore: 91,
          aiSummary: 'Équipement médical incomplet empêchant la mise en service. Expédition sonde urgente attendue.',
          aiRiskFlag: true,
          createdAt: ago(1),
          updatedAt: ago(0.3),
        },
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0104',
          subject: 'Erreur SSO SAML lors de la connexion des nouveaux chefs d’atelier',
          description:
            'Depuis la mise à jour d’hier soir, nos 4 nouveaux superviseurs reçoivent une erreur 403 Invalid Assertion sur le portail Lyon.',
          customerId: cust2.id,
          category: 'Support technique',
          subcategory: 'Accès & SSO',
          requestType: 'Incident technique',
          channel: 'LIVE_CHAT',
          priority: 'ELEVEE',
          status: 'EN_ATTENTE_INTERNE',
          agencyId: agLyon.id,
          teamId: teamTech.id,
          assignedUserId: nadia.id,
          tags: ['SSO', 'Authentification'],
          rootCause: 'Problème technique',
          solutionSummary: '',
          firstResponseAt: ago(4.5),
          firstResponseDueAt: ago(4),
          resolutionDueAt: hours(3),
          slaBreached: false,
          reopenCount: 0,
          aiSentiment: 'Neutre',
          aiUrgencyScore: 72,
          aiSummary: 'Blocage SSO SAML pour 4 utilisateurs. Escaladé en interne vers l’équipe IAM.',
          aiRiskFlag: false,
          createdAt: ago(5),
          updatedAt: ago(1),
        },
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0105',
          subject: 'Demande de décalage de livraison et geste commercial retard',
          description:
            'Le transporteur ne s’est pas présenté sur le créneau convenu hier. Nous avons dû immobiliser 2 personnes inutilement.',
          customerId: cust3.id,
          category: 'Livraison',
          subcategory: 'Retard transporteur',
          requestType: 'Réclamation',
          channel: 'WHATSAPP',
          priority: 'ELEVEE',
          status: 'EN_ATTENTE_CLIENT',
          agencyId: agBordeaux.id,
          teamId: teamLitiges.id,
          assignedUserId: thomas.id,
          tags: ['Transporteur', 'WhatsApp'],
          rootCause: 'Problème fournisseur',
          solutionSummary: 'Proposition d’avoir de 150 € et nouveau créneau garanti demain 08h30.',
          firstResponseAt: ago(7.5),
          firstResponseDueAt: ago(7),
          resolutionDueAt: hours(6),
          slaBreached: false,
          reopenCount: 0,
          aiSentiment: 'Négatif',
          aiUrgencyScore: 68,
          aiSummary: 'Mécontentement suite à rendez-vous transporteur manqué. En attente de confirmation du client.',
          aiRiskFlag: false,
          createdAt: ago(8),
          updatedAt: ago(2),
        },
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0106',
          subject: 'Réouverture : le module domotique se déconnecte encore la nuit',
          description:
            'Malgré la manipulation du firmware conseillée la semaine dernière, la passerelle perd le Wi-Fi chaque nuit vers 02h00.',
          customerId: cust6.id,
          category: 'Support technique',
          subcategory: 'Bug applicatif',
          requestType: 'Réclamation',
          channel: 'WEB_FORM',
          priority: 'URGENTE',
          status: 'REOUVERT',
          agencyId: agLyon.id,
          teamId: teamTech.id,
          assignedUserId: marc.id,
          tags: ['Récurrent', 'Firmware'],
          rootCause: 'Problème technique',
          solutionSummary: '',
          firstResponseAt: ago(25),
          firstResponseDueAt: ago(24),
          resolutionDueAt: hours(2),
          slaBreached: false,
          reopenCount: 1,
          aiSentiment: 'Négatif',
          aiUrgencyScore: 79,
          aiSummary: 'Ticket réouvert après échec du premier correctif firmware. Échange matériel envisagé.',
          aiRiskFlag: true,
          createdAt: ago(72),
          updatedAt: ago(0.8),
        },
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0107',
          subject: 'Demande de session de formation complémentaire équipe Lyon',
          description:
            'Nous accueillons 5 nouveaux opérateurs début décembre et souhaitons planifier une session de prise en main de 2h.',
          customerId: cust2.id,
          category: 'Formation',
          subcategory: 'Atelier équipe',
          requestType: 'Question',
          channel: 'EMAIL',
          priority: 'NORMALE',
          status: 'NOUVEAU',
          agencyId: agLyon.id,
          teamId: teamN1.id,
          assignedUserId: null,
          tags: ['Onboarding', 'Formation'],
          rootCause: 'Non définie',
          solutionSummary: '',
          firstResponseAt: null,
          firstResponseDueAt: hours(3.2),
          resolutionDueAt: hours(22),
          slaBreached: false,
          reopenCount: 0,
          aiSentiment: 'Positif',
          aiUrgencyScore: 25,
          aiSummary: 'Demande proactive de formation pour 5 nouveaux utilisateurs.',
          aiRiskFlag: false,
          createdAt: ago(0.6),
          updatedAt: ago(0.6),
        },
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0108',
          subject: 'Mention publique LinkedIn concernant délai d’attente SAV',
          description:
            'Message détecté sur les réseaux sociaux : client mécontent d’un délai de réponse de 48h sur une demande de devis SAV.',
          customerId: cust3.id,
          category: 'Service',
          subcategory: 'Délai intervention',
          requestType: 'Réclamation',
          channel: 'SOCIAL',
          priority: 'ELEVEE',
          status: 'EN_ATTENTE_ATTRIBUTION',
          agencyId: agBordeaux.id,
          teamId: teamN1.id,
          assignedUserId: null,
          tags: ['E-réputation', 'Réseaux sociaux'],
          rootCause: 'Mauvaise communication',
          solutionSummary: '',
          firstResponseAt: null,
          firstResponseDueAt: hours(0.5),
          resolutionDueAt: hours(7),
          slaBreached: false,
          reopenCount: 0,
          aiSentiment: 'Très négatif',
          aiUrgencyScore: 84,
          aiSummary: 'Signalement social public à traiter rapidement pour protéger l’image de marque.',
          aiRiskFlag: true,
          createdAt: ago(0.4),
          updatedAt: ago(0.4),
        },
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0109',
          subject: 'Avoir TVA intra-communautaire manquant sur facture d’octobre',
          description:
            'Notre service comptable a bien reçu l’avoir n° AV-441 mais le taux de TVA appliqué ne correspond pas au régime export.',
          customerId: cust1.id,
          category: 'Facturation',
          subcategory: 'Avoir / TVA',
          requestType: 'Réclamation',
          channel: 'EMAIL',
          priority: 'NORMALE',
          status: 'RESOLU',
          agencyId: agParis.id,
          teamId: teamLitiges.id,
          assignedUserId: claire.id,
          tags: ['TVA', 'Comptabilité'],
          rootCause: 'Erreur humaine',
          solutionSummary: 'Émission d’un avoir rectificatif AV-449 validé par le service financier.',
          firstResponseAt: ago(38),
          firstResponseDueAt: ago(36),
          resolutionDueAt: ago(16),
          resolvedAt: ago(20),
          slaBreached: false,
          reopenCount: 0,
          aiSentiment: 'Positif',
          aiUrgencyScore: 20,
          aiSummary: 'Erreur de saisie TVA corrigée dans les délais SLA.',
          aiRiskFlag: false,
          createdAt: ago(40),
          updatedAt: ago(20),
        },
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0110',
          subject: 'Remplacement capteur défectueux sous garantie constructeur',
          description:
            'Un capteur de pression série S4 affiche une dérive de +12% depuis son installation.',
          customerId: cust2.id,
          category: 'Produit',
          subcategory: 'Conformité',
          requestType: 'Réclamation',
          channel: 'WEB_FORM',
          priority: 'NORMALE',
          status: 'CLOTURE',
          agencyId: agLyon.id,
          teamId: teamTech.id,
          assignedUserId: thomas.id,
          tags: ['Garantie', 'Capteur'],
          rootCause: 'Défaut produit',
          solutionSummary: 'Remplacement standard effectué sous 24h et test de calibration validé.',
          firstResponseAt: ago(95),
          firstResponseDueAt: ago(92),
          resolutionDueAt: ago(70),
          resolvedAt: ago(78),
          closedAt: ago(72),
          slaBreached: false,
          reopenCount: 0,
          aiSentiment: 'Positif',
          aiUrgencyScore: 15,
          aiSummary: 'Dossier clôturé avec succès, client très satisfait de la rapidité.',
          aiRiskFlag: false,
          createdAt: ago(96),
          updatedAt: ago(72),
        },
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0111',
          subject: 'Incompréhension sur les frais de mise en service annuels',
          description:
            'Le montant facturé pour la visite préventive annuelle est supérieur de 180 € au devis initial.',
          customerId: cust5.id,
          category: 'Remboursement',
          subcategory: 'Geste commercial',
          requestType: 'Réclamation',
          channel: 'CSV_IMPORT',
          priority: 'ELEVEE',
          status: 'RESOLU',
          agencyId: agBordeaux.id,
          teamId: teamLitiges.id,
          assignedUserId: marc.id,
          tags: ['Devis', 'Geste commercial'],
          rootCause: 'Mauvaise communication',
          solutionSummary: 'Explication détaillée des options ajoutées + remise commerciale exceptionnelle de 90 €.',
          firstResponseAt: ago(50),
          firstResponseDueAt: ago(49),
          resolutionDueAt: ago(42),
          resolvedAt: ago(44),
          slaBreached: false,
          reopenCount: 0,
          aiSentiment: 'Neutre',
          aiUrgencyScore: 40,
          aiSummary: 'Écart devis/facture résolu à l’amiable via remise de 90 €.',
          aiRiskFlag: false,
          createdAt: ago(52),
          updatedAt: ago(44),
        },
        {
          orgId: org1.id,
          ticketNumber: 'CP-2026-0112',
          subject: 'Validation KYC bloquée pour ouverture compte filiale Nantes',
          description:
            'Nos documents Kbis et RIB ont été déposés il y a 3 jours mais le statut reste bloqué en vérification.',
          customerId: cust1.id,
          category: 'Inscription',
          subcategory: 'Validation KYC',
          requestType: 'Demande information',
          channel: 'WEB_FORM',
          priority: 'FAIBLE',
          status: 'CLOTURE',
          agencyId: agParis.id,
          teamId: teamN1.id,
          assignedUserId: thomas.id,
          tags: ['KYC', 'Filiale'],
          rootCause: 'Manque de formation',
          solutionSummary: 'Validation manuelle effectuée et accès portail transmis au responsable.',
          firstResponseAt: ago(120),
          firstResponseDueAt: ago(114),
          resolutionDueAt: ago(75),
          resolvedAt: ago(95),
          closedAt: ago(90),
          slaBreached: false,
          reopenCount: 0,
          aiSentiment: 'Positif',
          aiUrgencyScore: 10,
          aiSummary: 'Dossier KYC activé et clôturé.',
          aiRiskFlag: false,
          createdAt: ago(122),
          updatedAt: ago(90),
        },
      ])
      .returning();

    // Ticket Messages & Internal Notes
    const t0 = insertedTickets[0];
    const t1 = insertedTickets[1];
    const t2 = insertedTickets[2];
    const t5 = insertedTickets[5];

    await db.insert(ticketMessages).values([
      {
        orgId: org1.id,
        ticketId: t0.id,
        authorType: 'CUSTOMER',
        authorName: 'Sophie Valéry',
        body: 'Bonjour, nous avons 6 terminaux Scanner Pro totalement inopérants depuis 7h30 sur le quai B. Cela ralentit nos expéditions matinales. Merci d’intervenir en urgence.',
        isInternalNote: false,
        attachments: [{ name: 'photo_serie_lot881.jpg', size: '1.4 MB', mimeType: 'image/jpeg' }],
        createdAt: ago(2),
      },
      {
        orgId: org1.id,
        ticketId: t0.id,
        authorType: 'AGENT',
        authorName: 'Claire Moreau',
        authorUserId: claire.id,
        body: 'Note interne : Vérification faite avec l’entrepôt fournisseur — la série de blocs d’alimentation #881-B présente une anomalie sur le condensateur primaire. Envoi Chronopost 13h déclenché.',
        isInternalNote: true,
        attachments: [],
        createdAt: ago(1.5),
      },
      {
        orgId: org1.id,
        ticketId: t0.id,
        authorType: 'AGENT',
        authorName: 'Claire Moreau',
        authorUserId: claire.id,
        body: 'Bonjour Madame Valéry, nous avons immédiatement identifié le défaut sur cette série de blocs d’alimentation. 6 blocs neufs testés partent par coursier dédié et arriveront avant 14h00 sur votre site Paris Nord.',
        isInternalNote: false,
        attachments: [{ name: 'bon_expedition_express.pdf', size: '240 KB', mimeType: 'application/pdf' }],
        createdAt: ago(1.2),
      },
      {
        orgId: org1.id,
        ticketId: t1.id,
        authorType: 'CUSTOMER',
        authorName: 'Julien Marchand',
        body: 'Ci-joint notre relevé bancaire montrant les deux débits identiques de 2 450 € HT effectués le 14/11.',
        isInternalNote: false,
        attachments: [{ name: 'releve_sepa_nov2026.pdf', size: '410 KB', mimeType: 'application/pdf' }],
        createdAt: ago(5),
      },
      {
        orgId: org1.id,
        ticketId: t2.id,
        authorType: 'CUSTOMER',
        authorName: 'Élodie Garnier',
        body: 'Appel entrant enregistré : la sonde thermique calibrée est absente du colis livré à Médipôle Sud.',
        isInternalNote: false,
        attachments: [],
        createdAt: ago(1),
      },
      {
        orgId: org1.id,
        ticketId: t5.id,
        authorType: 'CUSTOMER',
        authorName: 'Lucas Perrot',
        body: 'Le problème persiste malgré la réinitialisation du routeur et la mise à jour v2.4.1.',
        isInternalNote: false,
        attachments: [],
        createdAt: ago(1),
      },
    ]);

    // Satisfaction Surveys
    await db.insert(satisfactionSurveys).values([
      {
        orgId: org1.id,
        ticketId: insertedTickets[8].id,
        customerId: cust1.id,
        agentUserId: claire.id,
        agencyId: agParis.id,
        category: 'Facturation',
        csatScore: 5,
        npsScore: 9,
        cesScore: 6,
        comment: 'Réactivité exemplaire sur la rectification de notre avoir TVA.',
        submittedAt: ago(18),
      },
      {
        orgId: org1.id,
        ticketId: insertedTickets[9].id,
        customerId: cust2.id,
        agentUserId: thomas.id,
        agencyId: agLyon.id,
        category: 'Produit',
        csatScore: 5,
        npsScore: 10,
        cesScore: 7,
        comment: 'Capteur remplacé en 24h sans aucune friction.',
        submittedAt: ago(70),
      },
      {
        orgId: org1.id,
        ticketId: insertedTickets[10].id,
        customerId: cust5.id,
        agentUserId: marc.id,
        agencyId: agBordeaux.id,
        category: 'Remboursement',
        csatScore: 3,
        npsScore: 6,
        cesScore: 4,
        comment: 'Le geste commercial est apprécié mais le devis initial manquait de clarté.',
        submittedAt: ago(40),
      },
      {
        orgId: org1.id,
        ticketId: insertedTickets[11].id,
        customerId: cust1.id,
        agentUserId: thomas.id,
        agencyId: agParis.id,
        category: 'Inscription',
        csatScore: 4,
        npsScore: 8,
        cesScore: 5,
        comment: 'Validation rapide une fois le dossier pris en charge.',
        submittedAt: ago(85),
      },
      {
        orgId: org1.id,
        ticketId: t1.id,
        customerId: cust4.id,
        agentUserId: marc.id,
        agencyId: agParis.id,
        category: 'Facturation',
        csatScore: 2,
        npsScore: 3,
        cesScore: 2,
        comment: 'Délai trop long pour corriger un double prélèvement évident.',
        submittedAt: ago(1),
      },
    ]);

    // Automation Rules
    await db.insert(automationRules).values([
      {
        orgId: org1.id,
        name: 'Escalade automatique des tickets Critiques',
        description: 'Alerte immédiate du responsable qualité et notification prioritaire dès réception d’un ticket Critique.',
        isActive: true,
        triggerEvent: 'TICKET_CREATED',
        conditions: [{ field: 'priority', operator: 'EQUALS', value: 'CRITIQUE' }],
        actions: [
          { type: 'ADD_TAG', value: 'Escalade Direction' },
          { type: 'CREATE_NOTIFICATION', value: 'Ticket critique détecté — intervention immédiate requise' },
        ],
        executionCount: 14,
        lastTriggeredAt: ago(1),
      },
      {
        orgId: org1.id,
        name: 'Routage Réclamations Facturation & Remboursement',
        description: 'Oriente automatiquement les demandes financières vers l’équipe Réclamations & Litiges.',
        isActive: true,
        triggerEvent: 'TICKET_CREATED',
        conditions: [{ field: 'category', operator: 'IN', value: 'Facturation,Remboursement' }],
        actions: [
          { type: 'ASSIGN_TEAM', value: 'Réclamations & Litiges' },
          { type: 'ADD_TAG', value: 'Finance' },
        ],
        executionCount: 29,
        lastTriggeredAt: ago(5),
      },
      {
        orgId: org1.id,
        name: 'Détection mot-clé juridique ou mise en demeure',
        description: 'Passe la priorité à Urgente et ajoute le tag Risque Juridique si le texte mentionne litige ou avocat.',
        isActive: true,
        triggerEvent: 'TICKET_CREATED',
        conditions: [{ field: 'keyword', operator: 'CONTAINS', value: 'avocat,mise en demeure,huissier,litige' }],
        actions: [
          { type: 'SET_PRIORITY', value: 'URGENTE' },
          { type: 'ADD_TAG', value: 'Risque Juridique' },
        ],
        executionCount: 4,
        lastTriggeredAt: ago(48),
      },
      {
        orgId: org1.id,
        name: 'Enquête CSAT/NPS automatique à la résolution',
        description: 'Génère une alerte d’envoi d’enquête de satisfaction dès qu’un ticket passe au statut Résolu.',
        isActive: true,
        triggerEvent: 'TICKET_RESOLVED',
        conditions: [{ field: 'status', operator: 'EQUALS', value: 'RESOLU' }],
        actions: [{ type: 'SEND_SURVEY', value: 'Enquête CSAT + NPS + CES' }],
        executionCount: 42,
        lastTriggeredAt: ago(20),
      },
    ]);

    // Knowledge Base Articles
    await db.insert(kbArticles).values([
      {
        orgId: org1.id,
        title: 'Procédure de remplacement express bloc alimentation Lot #881',
        category: 'Produit',
        articleType: 'PROCEDURE',
        content:
          '1. Vérifier le numéro de série sous le terminal (séries #881-A à #881-D).\n2. Déclencher un envoi Chronopost 13h depuis le dépôt central sans attendre le retour du matériel défectueux.\n3. Joindre le bon de retour prépayé pour analyse qualité fournisseur.',
        visibility: 'INTERNAL',
        isPublished: true,
        viewsCount: 48,
        helpfulCount: 19,
        authorName: 'Claire Moreau',
      },
      {
        orgId: org1.id,
        title: 'Traitement des doubles prélèvements SEPA & CB',
        category: 'Facturation',
        articleType: 'SCRIPT',
        content:
          'Script de réponse validé : "Nous avons vérifié votre relevé bancaire et confirmons qu’un doublon technique s’est produit lors de la remise en banque. Le virement de remboursement est programmé sous 48h ouvrées et votre avoir est disponible dans votre portail."',
        visibility: 'INTERNAL',
        isPublished: true,
        viewsCount: 112,
        helpfulCount: 43,
        authorName: 'Marc Lefèvre',
      },
      {
        orgId: org1.id,
        title: 'Comment diagnostiquer une erreur SSO SAML 403',
        category: 'Support technique',
        articleType: 'GUIDE',
        content:
          'Vérifiez que l’attribut EmailNameID correspond exactement à l’adresse déclarée dans l’espace organisation et que le certificat IdP n’a pas expiré au cours des dernières 24 heures.',
        visibility: 'PUBLIC',
        isPublished: true,
        viewsCount: 204,
        helpfulCount: 67,
        authorName: 'Nadia Khelifi',
      },
      {
        orgId: org1.id,
        title: 'Délais d’expédition des sondes et pièces détachées Médipôle',
        category: 'Livraison',
        articleType: 'FAQ',
        content:
          'Toutes les pièces critiques liées à la chaîne du froid bénéficient d’un stock tampon dédié à Bordeaux et Paris permettant une expédition le jour même pour toute demande enregistrée avant 16h30.',
        visibility: 'PUBLIC',
        isPublished: true,
        viewsCount: 89,
        helpfulCount: 31,
        authorName: 'Thomas Bernard',
      },
      {
        orgId: org1.id,
        title: 'Grille des gestes commerciaux autorisés par palier',
        category: 'Remboursement',
        articleType: 'PROCEDURE',
        content:
          '- Agent N1 : jusqu’à 100 € HT sans validation.\n- Responsable Service Client : jusqu’à 500 € HT.\n- Directeur Qualité : au-delà de 500 € HT ou avoir contractuel.',
        visibility: 'INTERNAL',
        isPublished: true,
        viewsCount: 156,
        helpfulCount: 58,
        authorName: 'Claire Moreau',
      },
    ]);

    // Notifications
    await db.insert(notifications).values([
      {
        orgId: org1.id,
        userId: user.id,
        type: 'SLA_RISK',
        title: 'SLA Critique imminent — CP-2026-0101',
        message: 'Le ticket VIP Groupe Mercure atteint 78% de son délai de résolution (42 min restantes).',
        ticketId: t0.id,
        isRead: false,
      },
      {
        orgId: org1.id,
        userId: user.id,
        type: 'SLA_BREACHED',
        title: 'Dépassement SLA — CP-2026-0102',
        message: 'Le ticket Double prélèvement Optique Centrale a dépassé le SLA de résolution.',
        ticketId: t1.id,
        isRead: false,
      },
      {
        orgId: org1.id,
        userId: user.id,
        type: 'LOW_CSAT',
        title: 'Alerte satisfaction client (CSAT 2/5)',
        message: 'Julien Marchand (Optique Centrale) a laissé une note CSAT de 2/5 sur Facturation.',
        ticketId: t1.id,
        isRead: false,
      },
      {
        orgId: org1.id,
        userId: user.id,
        type: 'REOPENED',
        title: 'Ticket réouvert — CP-2026-0106',
        message: 'Lucas Perrot a signalé que le correctif firmware n’a pas résolu la déconnexion.',
        ticketId: t5.id,
        isRead: true,
      },
    ]);

    // Activity Logs
    await db.insert(activityLogs).values([
      {
        orgId: org1.id,
        actorName: 'Claire Moreau',
        actorEmail: 'claire.moreau@horizon-demo.fr',
        action: 'ESCALADED_TICKET',
        targetType: 'TICKET',
        targetId: 'CP-2026-0101',
        details: 'Escalade vers Expertise Technique & Qualité avec envoi coursier.',
      },
      {
        orgId: org1.id,
        actorName: 'Système Automatisation',
        actorEmail: 'workflows@clientpulse360.fr',
        action: 'RULE_EXECUTED',
        targetType: 'AUTOMATION',
        targetId: 'Escalade automatique des tickets Critiques',
        details: 'Tag Escalade Direction ajouté sur CP-2026-0103.',
      },
      {
        orgId: org1.id,
        actorName: 'Nadia Khelifi',
        actorEmail: 'nadia.khelifi@horizon-demo.fr',
        action: 'EXPORTED_REPORT',
        targetType: 'REPORT',
        targetId: 'Rapport Mensuel SLA & Causes Racines',
        details: 'Export CSV généré pour le comité qualité.',
      },
    ]);

    await ensureOrgCertificationAndSurveys(org1.id);

    return org1.id;
  } catch (error) {
    console.error('Database error in ensureDemoDataForUser:', error);
    throw new Error('Erreur lors de l’initialisation des données de démonstration.', { cause: error });
  }
}
