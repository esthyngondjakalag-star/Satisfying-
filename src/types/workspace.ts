export type OrgPlan = 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
export type OrgRole = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'CS_MANAGER' | 'AGENT' | 'ANALYST';

export type TicketStatus =
  | 'NOUVEAU'
  | 'EN_ATTENTE_ATTRIBUTION'
  | 'ASSIGNE'
  | 'EN_COURS'
  | 'EN_ATTENTE_CLIENT'
  | 'EN_ATTENTE_INTERNE'
  | 'ESCALADE'
  | 'RESOLU'
  | 'CLOTURE'
  | 'REOUVERT';

export type TicketPriority = 'FAIBLE' | 'NORMALE' | 'ELEVEE' | 'URGENTE' | 'CRITIQUE';

export type TicketChannel =
  | 'WEB_FORM'
  | 'EMAIL'
  | 'WHATSAPP'
  | 'LIVE_CHAT'
  | 'SOCIAL'
  | 'PHONE'
  | 'CSV_IMPORT';

export interface Organization {
  id: number;
  name: string;
  slug: string;
  industry: string;
  plan: OrgPlan;
  status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL';
  billingCycle: 'MONTHLY' | 'ANNUAL';
  mrrCents: number;
  maxAgents: number;
  primaryColor: string;
  portalTitle: string;
  workingHours: { start: string; end: string; days: string[] };
  holidays: string[];
  trialEndsAt: string | null;
  billingEmail: string;
  paymentMethodBrand: string;
  paymentMethodLast4: string;
  nextBillingAt: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

export interface Invoice {
  id: number;
  orgId: number;
  invoiceNumber: string;
  plan: OrgPlan;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  amountCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  status: 'PAID' | 'PENDING' | 'VOID';
  paymentProvider: string;
  paymentMethodSummary: string;
  stripeSessionId: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  createdAt: string;
}

export interface Agency {
  id: number;
  orgId: number;
  name: string;
  code: string;
  city: string;
  country: string;
  managerName: string;
}

export interface Team {
  id: number;
  orgId: number;
  agencyId: number | null;
  name: string;
  description: string;
  leadName: string;
}

export interface OrgMember {
  id: number;
  orgId: number;
  userId: number;
  agencyId: number | null;
  teamId: number | null;
  role: OrgRole;
  status: string;
  maxLoad: number;
  jobTitle: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
}

export interface Category {
  id: number;
  orgId: number;
  name: string;
  subcategories: string[];
  requestTypes: string[];
  isDefault: boolean;
}

export interface SlaPolicy {
  id: number;
  orgId: number;
  name: string;
  priority: TicketPriority;
  categoryName: string;
  customerType: string;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  escalateAtPercent: number;
  businessHoursOnly: boolean;
  isActive: boolean;
}

export interface CustomerPurchase {
  ref: string;
  item: string;
  amountCents: number;
  date: string;
}

export interface Customer {
  id: number;
  orgId: number;
  externalCode: string;
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  customerType: 'VIP' | 'ENTERPRISE' | 'PME' | 'PARTICULIER';
  agencyId: number | null;
  totalSpentCents: number;
  purchases: CustomerPurchase[];
  tags: string[];
  internalNotes: string;
  registeredAt: string;
}

export interface Ticket {
  id: number;
  orgId: number;
  ticketNumber: string;
  subject: string;
  description: string;
  customerId: number;
  category: string;
  subcategory: string;
  requestType: string;
  channel: TicketChannel;
  priority: TicketPriority;
  status: TicketStatus;
  agencyId: number | null;
  teamId: number | null;
  assignedUserId: number | null;
  tags: string[];
  rootCause: string;
  solutionSummary: string;
  firstResponseAt: string | null;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaBreached: boolean;
  reopenCount: number;
  mergedIntoTicketId: number | null;
  aiSentiment: string;
  aiUrgencyScore: number;
  aiSummary: string;
  aiRiskFlag: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: number;
  orgId: number;
  ticketId: number;
  authorType: 'AGENT' | 'CUSTOMER' | 'SYSTEM' | 'AI';
  authorName: string;
  authorUserId: number | null;
  body: string;
  isInternalNote: boolean;
  attachments: Array<{ name: string; size: string; mimeType: string }>;
  createdAt: string;
}

export interface SurveyQuestion {
  id: string;
  label: string;
  type: 'RATING_5' | 'YES_NO' | 'TEXT';
  required: boolean;
}

export interface SurveyTemplate {
  id: number;
  orgId: number;
  title: string;
  description: string;
  targetCategory: string;
  includeCsat: boolean;
  includeNps: boolean;
  includeCes: boolean;
  questions: SurveyQuestion[];
  isActive: boolean;
  createdAt: string;
}

export interface SurveyInvitation {
  id: number;
  orgId: number;
  token: string;
  templateId: number;
  ticketId: number | null;
  customerId: number;
  channel: 'EMAIL' | 'LINK' | 'WHATSAPP';
  status: 'SENT' | 'COMPLETED';
  sentAt: string;
  completedAt: string | null;
}

export interface SatisfactionSurvey {
  id: number;
  orgId: number;
  templateId: number | null;
  ticketId: number | null;
  customerId: number;
  agentUserId: number | null;
  agencyId: number | null;
  category: string;
  csatScore: number;
  npsScore: number;
  cesScore: number;
  customAnswers: Array<{ questionId: string; label: string; answer: string }>;
  comment: string;
  submittedAt: string;
}

export interface AutomationRule {
  id: number;
  orgId: number;
  name: string;
  description: string;
  isActive: boolean;
  triggerEvent: string;
  conditions: Array<{ field: string; operator: string; value: string }>;
  actions: Array<{ type: string; value: string }>;
  executionCount: number;
  lastTriggeredAt: string | null;
}

export interface KbArticle {
  id: number;
  orgId: number;
  title: string;
  category: string;
  articleType: 'FAQ' | 'GUIDE' | 'PROCEDURE' | 'SCRIPT' | 'SOLUTION';
  content: string;
  visibility: 'PUBLIC' | 'INTERNAL';
  isPublished: boolean;
  viewsCount: number;
  helpfulCount: number;
  authorName: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: number;
  orgId: number;
  type: string;
  title: string;
  message: string;
  ticketId: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: number;
  orgId: number;
  actorName: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface WorkspaceBootstrap {
  currentUser: {
    id: number;
    uid: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    isSuperAdmin: boolean;
    activeRole: OrgRole;
  };
  stripeConfigured: boolean;
  accessibleOrganizations: Organization[];
  activeOrganization: Organization;
  agencies: Agency[];
  teams: Team[];
  members: OrgMember[];
  categories: Category[];
  slaPolicies: SlaPolicy[];
  customers: Customer[];
  tickets: Ticket[];
  messages: TicketMessage[];
  surveys: SatisfactionSurvey[];
  surveyTemplates: SurveyTemplate[];
  surveyInvitations: SurveyInvitation[];
  automations: AutomationRule[];
  kbArticles: KbArticle[];
  notifications: NotificationItem[];
  activityLogs: ActivityLog[];
  invoices: Invoice[];
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  NOUVEAU: 'Nouveau',
  EN_ATTENTE_ATTRIBUTION: 'En attente d’attribution',
  ASSIGNE: 'Assigné',
  EN_COURS: 'En cours',
  EN_ATTENTE_CLIENT: 'En attente client',
  EN_ATTENTE_INTERNE: 'En attente interne',
  ESCALADE: 'Escaladé',
  RESOLU: 'Résolu',
  CLOTURE: 'Clôturé',
  REOUVERT: 'Réouvert',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  FAIBLE: 'Faible',
  NORMALE: 'Normale',
  ELEVEE: 'Élevée',
  URGENTE: 'Urgente',
  CRITIQUE: 'Critique',
};

export const CHANNEL_LABELS: Record<TicketChannel, string> = {
  WEB_FORM: 'Portail Web',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp Business',
  LIVE_CHAT: 'Chat en direct',
  SOCIAL: 'Réseaux sociaux',
  PHONE: 'Téléphone',
  CSV_IMPORT: 'Import Excel/CSV',
};

export const ROOT_CAUSES = [
  'Non définie',
  'Erreur humaine',
  'Problème technique',
  'Processus défaillant',
  'Manque de formation',
  'Problème fournisseur',
  'Défaut produit',
  'Mauvaise communication',
  'Problème de facturation',
  'Cause inconnue',
];

export const ROLE_LABELS: Record<OrgRole, string> = {
  SUPER_ADMIN: 'Super Admin SaaS',
  ORG_ADMIN: 'Admin Entreprise',
  CS_MANAGER: 'Responsable Service Client',
  AGENT: 'Agent Support',
  ANALYST: 'Analyste Lecture Seule',
};

export const SAV_SERVICE_TYPES = [
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

export function formatCurrencyEUR(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function computeSlaCountdown(ticket: Ticket, nowMs = Date.now()): {
  label: string;
  state: 'resolved' | 'breached' | 'warning' | 'nominal';
  remainingMinutes: number;
} {
  if (ticket.status === 'RESOLU' || ticket.status === 'CLOTURE') {
    return {
      label: ticket.slaBreached ? 'Résolu hors SLA' : 'Respecté',
      state: ticket.slaBreached ? 'breached' : 'resolved',
      remainingMinutes: 0,
    };
  }
  if (!ticket.resolutionDueAt) {
    return { label: 'Non défini', state: 'nominal', remainingMinutes: 999 };
  }
  const dueMs = new Date(ticket.resolutionDueAt).getTime();
  const diffMin = Math.round((dueMs - nowMs) / 60000);

  if (diffMin <= 0 || ticket.slaBreached) {
    const abs = Math.abs(diffMin);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return {
      label: `Dépassé -${h > 0 ? `${h}h ` : ''}${m}m`,
      state: 'breached',
      remainingMinutes: diffMin,
    };
  }

  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  const state = diffMin <= 90 ? 'warning' : 'nominal';
  return {
    label: `${h > 0 ? `${h}h ` : ''}${m}m restantes`,
    state,
    remainingMinutes: diffMin,
  };
}
