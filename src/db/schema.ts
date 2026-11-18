import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  industry: text('industry').notNull().default('Services B2B'),
  plan: text('plan').notNull().default('ENTERPRISE'), // STARTER | BUSINESS | ENTERPRISE
  status: text('status').notNull().default('ACTIVE'), // ACTIVE | SUSPENDED | TRIAL
  billingCycle: text('billing_cycle').notNull().default('ANNUAL'), // MONTHLY | ANNUAL
  mrrCents: integer('mrr_cents').notNull().default(49900),
  maxAgents: integer('max_agents').notNull().default(50),
  primaryColor: text('primary_color').notNull().default('#2563EB'),
  portalTitle: text('portal_title').notNull().default('Portail Support Client'),
  workingHours: jsonb('working_hours')
    .$type<{ start: string; end: string; days: string[] }>()
    .notNull()
    .default({ start: '08:30', end: '18:30', days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'] }),
  holidays: jsonb('holidays').$type<string[]>().notNull().default(['2026-01-01', '2026-05-01', '2026-07-14', '2026-12-25']),
  trialEndsAt: timestamp('trial_ends_at'),
  billingEmail: text('billing_email').notNull().default(''),
  paymentMethodBrand: text('payment_method_brand').notNull().default(''),
  paymentMethodLast4: text('payment_method_last4').notNull().default(''),
  stripeCustomerId: text('stripe_customer_id').notNull().default(''),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().default(''),
  nextBillingAt: timestamp('next_billing_at'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const agencies = pgTable('agencies', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  city: text('city').notNull(),
  country: text('country').notNull().default('France'),
  managerName: text('manager_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  agencyId: integer('agency_id').references(() => agencies.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  leadName: text('lead_name').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    agencyId: integer('agency_id').references(() => agencies.id, { onDelete: 'set null' }),
    teamId: integer('team_id').references(() => teams.id, { onDelete: 'set null' }),
    role: text('role').notNull().default('AGENT'), // SUPER_ADMIN | ORG_ADMIN | CS_MANAGER | AGENT | ANALYST
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | INVITED | DISABLED
    maxLoad: integer('max_load').notNull().default(15),
    jobTitle: text('job_title').notNull().default('Conseiller Clientèle'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('memberships_org_user_idx').on(table.orgId, table.userId)]
);

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  subcategories: jsonb('subcategories').$type<string[]>().notNull().default([]),
  requestTypes: jsonb('request_types').$type<string[]>().notNull().default(['Réclamation', 'Demande information', 'Incident']),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const slaPolicies = pgTable('sla_policies', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  priority: text('priority').notNull(), // FAIBLE | NORMALE | ELEVEE | URGENTE | CRITIQUE
  categoryName: text('category_name').notNull().default('ALL'),
  customerType: text('customer_type').notNull().default('ALL'),
  firstResponseMinutes: integer('first_response_minutes').notNull().default(60),
  resolutionMinutes: integer('resolution_minutes').notNull().default(480),
  escalateAtPercent: integer('escalate_at_percent').notNull().default(80),
  businessHoursOnly: boolean('business_hours_only').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  externalCode: text('external_code').notNull(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull().default(''),
  companyName: text('company_name').notNull().default(''),
  customerType: text('customer_type').notNull().default('PME'), // VIP | ENTERPRISE | PME | PARTICULIER
  agencyId: integer('agency_id').references(() => agencies.id, { onDelete: 'set null' }),
  totalSpentCents: integer('total_spent_cents').notNull().default(0),
  purchases: jsonb('purchases')
    .$type<Array<{ ref: string; item: string; amountCents: number; date: string }>>()
    .notNull()
    .default([]),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  internalNotes: text('internal_notes').notNull().default(''),
  registeredAt: timestamp('registered_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  ticketNumber: text('ticket_number').notNull(),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  customerId: integer('customer_id')
    .references(() => customers.id, { onDelete: 'cascade' })
    .notNull(),
  category: text('category').notNull(),
  subcategory: text('subcategory').notNull().default('Général'),
  requestType: text('request_type').notNull().default('Réclamation'),
  channel: text('channel').notNull().default('WEB_FORM'), // WEB_FORM | EMAIL | WHATSAPP | LIVE_CHAT | SOCIAL | PHONE | CSV_IMPORT
  priority: text('priority').notNull().default('NORMALE'), // FAIBLE | NORMALE | ELEVEE | URGENTE | CRITIQUE
  status: text('status').notNull().default('NOUVEAU'), // NOUVEAU | EN_ATTENTE_ATTRIBUTION | ASSIGNE | EN_COURS | EN_ATTENTE_CLIENT | EN_ATTENTE_INTERNE | ESCALADE | RESOLU | CLOTURE | REOUVERT
  agencyId: integer('agency_id').references(() => agencies.id, { onDelete: 'set null' }),
  teamId: integer('team_id').references(() => teams.id, { onDelete: 'set null' }),
  assignedUserId: integer('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  rootCause: text('root_cause').notNull().default('Non définie'),
  solutionSummary: text('solution_summary').notNull().default(''),
  firstResponseAt: timestamp('first_response_at'),
  firstResponseDueAt: timestamp('first_response_due_at'),
  resolutionDueAt: timestamp('resolution_due_at'),
  resolvedAt: timestamp('resolved_at'),
  closedAt: timestamp('closed_at'),
  slaBreached: boolean('sla_breached').notNull().default(false),
  reopenCount: integer('reopen_count').notNull().default(0),
  mergedIntoTicketId: integer('merged_into_ticket_id'),
  aiSentiment: text('ai_sentiment').notNull().default('Neutre'),
  aiUrgencyScore: integer('ai_urgency_score').notNull().default(50),
  aiSummary: text('ai_summary').notNull().default(''),
  aiRiskFlag: boolean('ai_risk_flag').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ticketMessages = pgTable('ticket_messages', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  ticketId: integer('ticket_id')
    .references(() => tickets.id, { onDelete: 'cascade' })
    .notNull(),
  authorType: text('author_type').notNull().default('AGENT'), // AGENT | CUSTOMER | SYSTEM | AI
  authorName: text('author_name').notNull(),
  authorUserId: integer('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  isInternalNote: boolean('is_internal_note').notNull().default(false),
  attachments: jsonb('attachments')
    .$type<Array<{ name: string; size: string; mimeType: string }>>()
    .notNull()
    .default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const surveyTemplates = pgTable('survey_templates', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  targetCategory: text('target_category').notNull().default('ALL'),
  includeCsat: boolean('include_csat').notNull().default(true),
  includeNps: boolean('include_nps').notNull().default(true),
  includeCes: boolean('include_ces').notNull().default(true),
  questions: jsonb('questions')
    .$type<Array<{ id: string; label: string; type: 'RATING_5' | 'YES_NO' | 'TEXT'; required: boolean }>>()
    .notNull()
    .default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const surveyInvitations = pgTable('survey_invitations', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  token: text('token').notNull().unique(),
  templateId: integer('template_id')
    .references(() => surveyTemplates.id, { onDelete: 'cascade' })
    .notNull(),
  ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
  customerId: integer('customer_id')
    .references(() => customers.id, { onDelete: 'cascade' })
    .notNull(),
  channel: text('channel').notNull().default('LINK'), // EMAIL | LINK | WHATSAPP
  status: text('status').notNull().default('SENT'), // SENT | COMPLETED
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export const satisfactionSurveys = pgTable('satisfaction_surveys', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  templateId: integer('template_id').references(() => surveyTemplates.id, { onDelete: 'set null' }),
  ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
  customerId: integer('customer_id')
    .references(() => customers.id, { onDelete: 'cascade' })
    .notNull(),
  agentUserId: integer('agent_user_id').references(() => users.id, { onDelete: 'set null' }),
  agencyId: integer('agency_id').references(() => agencies.id, { onDelete: 'set null' }),
  category: text('category').notNull(),
  csatScore: integer('csat_score').notNull(), // 1..5
  npsScore: integer('nps_score').notNull(), // 0..10
  cesScore: integer('ces_score').notNull(), // 1..7
  customAnswers: jsonb('custom_answers')
    .$type<Array<{ questionId: string; label: string; answer: string }>>()
    .notNull()
    .default([]),
  comment: text('comment').notNull().default(''),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
});

export const automationRules = pgTable('automation_rules', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  triggerEvent: text('trigger_event').notNull().default('TICKET_CREATED'),
  conditions: jsonb('conditions')
    .$type<Array<{ field: string; operator: string; value: string }>>()
    .notNull()
    .default([]),
  actions: jsonb('actions')
    .$type<Array<{ type: string; value: string }>>()
    .notNull()
    .default([]),
  executionCount: integer('execution_count').notNull().default(0),
  lastTriggeredAt: timestamp('last_triggered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const kbArticles = pgTable('kb_articles', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  articleType: text('article_type').notNull().default('GUIDE'), // FAQ | GUIDE | PROCEDURE | SCRIPT | SOLUTION
  content: text('content').notNull(),
  visibility: text('visibility').notNull().default('PUBLIC'), // PUBLIC | INTERNAL
  isPublished: boolean('is_published').notNull().default(true),
  viewsCount: integer('views_count').notNull().default(0),
  helpfulCount: integer('helpful_count').notNull().default(0),
  authorName: text('author_name').notNull().default('Équipe Qualité'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // NEW_TICKET | ASSIGNED | NEW_MESSAGE | ESCALATION | SLA_RISK | SLA_BREACHED | REOPENED | LOW_CSAT | REMINDER | REPORT_READY
  title: text('title').notNull(),
  message: text('message').notNull(),
  ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  actorName: text('actor_name').notNull(),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  details: text('details').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  plan: text('plan').notNull(),
  billingCycle: text('billing_cycle').notNull().default('ANNUAL'),
  amountCents: integer('amount_cents').notNull(),
  taxCents: integer('tax_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  currency: text('currency').notNull().default('EUR'),
  status: text('status').notNull().default('PAID'), // PAID | PENDING | VOID
  paymentProvider: text('payment_provider').notNull().default('CARD'), // STRIPE | CARD | SEPA
  paymentMethodSummary: text('payment_method_summary').notNull().default(''),
  stripeSessionId: text('stripe_session_id').notNull().default(''),
  periodStart: timestamp('period_start').defaultNow().notNull(),
  periodEnd: timestamp('period_end').notNull(),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  agencies: many(agencies),
  teams: many(teams),
  memberships: many(memberships),
  tickets: many(tickets),
  customers: many(customers),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  organization: one(organizations, { fields: [tickets.orgId], references: [organizations.id] }),
  customer: one(customers, { fields: [tickets.customerId], references: [customers.id] }),
  agency: one(agencies, { fields: [tickets.agencyId], references: [agencies.id] }),
  team: one(teams, { fields: [tickets.teamId], references: [teams.id] }),
  assignedUser: one(users, { fields: [tickets.assignedUserId], references: [users.id] }),
  messages: many(ticketMessages),
  surveys: many(satisfactionSurveys),
}));
