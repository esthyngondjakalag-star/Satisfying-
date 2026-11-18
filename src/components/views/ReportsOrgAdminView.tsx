import React, { useEffect, useState } from 'react';
import {
  Download,
  Printer,
  Plus,
  Building,
  Shield,
  Check,
  CreditCard,
  Receipt,
  X,
  Lock,
  AlertCircle,
} from 'lucide-react';
import {
  Invoice,
  OrgPlan,
  OrgRole,
  ROLE_LABELS,
  STATUS_LABELS,
  WorkspaceBootstrap,
  formatCurrencyEUR,
} from '../../types/workspace';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/apiClient';

const PLAN_PRICING: Record<
  OrgPlan,
  { monthlyCents: number; annualMonthlyCents: number; maxAgents: number; audience: string; limits: string[] }
> = {
  STARTER: {
    monthlyCents: 7900,
    annualMonthlyCents: 6500,
    maxAgents: 5,
    audience: 'Pour petites équipes SAV',
    limits: ['Jusqu’à 5 collaborateurs', 'Tickets & CRM client', 'Dashboard & CSAT standard'],
  },
  BUSINESS: {
    monthlyCents: 24900,
    annualMonthlyCents: 19900,
    maxAgents: 25,
    audience: 'Pour opérations en croissance',
    limits: ['Jusqu’à 25 collaborateurs', 'SLA, Automatisations & Enquêtes NPS/CES', 'Base de connaissances & Portail Client'],
  },
  ENTERPRISE: {
    monthlyCents: 59900,
    annualMonthlyCents: 49900,
    maxAgents: 100,
    audience: 'Pour directions qualité multi-sites',
    limits: ['Jusqu’à 100 collaborateurs & Multi-agences', 'Copilote IA & Analyse causes racines', 'Workflows avancés & Permissions RBAC'],
  },
};

export function ReportsOrgAdminView({
  data,
  mode,
  onRefresh,
  onSwitchOrg,
}: {
  data: WorkspaceBootstrap;
  mode: 'reports' | 'org' | 'super-admin';
  onRefresh: () => Promise<void>;
  onSwitchOrg: (orgId: number) => Promise<void>;
}) {
  const { getToken } = useAuth();
  const [reportType, setReportType] = useState<'satisfaction' | 'tickets' | 'agents' | 'sla' | 'agencies'>('tickets');

  // Org Management state
  const [agencyName, setAgencyName] = useState('');
  const [agencyCity, setAgencyCity] = useState('');
  const [teamName, setTeamName] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('AGENT');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catSubs, setCatSubs] = useState('');
  const [newSubByCat, setNewSubByCat] = useState<Record<number, string>>({});
  const [portalTitle, setPortalTitle] = useState(data.activeOrganization.portalTitle);
  const [primaryColor, setPrimaryColor] = useState(data.activeOrganization.primaryColor);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>(data.activeOrganization.billingCycle);

  // Billing / Checkout modal state
  const [checkoutPlan, setCheckoutPlan] = useState<OrgPlan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'SEPA' | 'STRIPE'>(
    data.stripeConfigured ? 'STRIPE' : 'CARD'
  );
  const [billingEmail, setBillingEmail] = useState(
    data.activeOrganization.billingEmail || data.currentUser.email || ''
  );
  const [cardHolder, setCardHolder] = useState(data.activeOrganization.name);
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [cardExp, setCardExp] = useState('09/29');
  const [cardCvc, setCardCvc] = useState('424');
  const [ibanValue, setIbanValue] = useState('FR76 3000 6000 0112 3456 7890 189');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Super Admin state
  const [superOverview, setSuperOverview] = useState<{
    organizations: Array<any>;
    totalUsers: number;
    totalTickets: number;
    totalMrrCents: number;
    totalCollectedCents: number;
    invoices: Array<Invoice & { orgName?: string }>;
    recentLogs: Array<any>;
  } | null>(null);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgIndustry, setNewOrgIndustry] = useState('Services B2B');
  const [newOrgPlan, setNewOrgPlan] = useState<OrgPlan>('BUSINESS');

  useEffect(() => {
    setPortalTitle(data.activeOrganization.portalTitle);
    setPrimaryColor(data.activeOrganization.primaryColor);
    setBillingCycle(data.activeOrganization.billingCycle);
    setBillingEmail(data.activeOrganization.billingEmail || data.currentUser.email || '');
  }, [data.activeOrganization.id]);

  useEffect(() => {
    if (mode === 'super-admin' && data.currentUser.isSuperAdmin) {
      getToken().then((token) => {
        if (!token) return;
        apiRequest<typeof superOverview>('/api/super-admin/overview', {
          token,
          orgId: data.activeOrganization.id,
        }).then(setSuperOverview);
      });
    }
  }, [mode, data.currentUser.isSuperAdmin, data.activeOrganization.id]);

  const canManageOrg = ['ORG_ADMIN', 'SUPER_ADMIN'].includes(data.currentUser.activeRole);

  // Export report CSV/Excel
  const handleDownloadReport = () => {
    let csv = '';
    if (reportType === 'tickets') {
      csv =
        'Ticket,Sujet,Catégorie,Priorité,Statut,Cause Racine,SLA Dépassé\n' +
        data.tickets
          .map(
            (t) =>
              `${t.ticketNumber},"${t.subject.replace(/"/g, '""')}",${t.category},${t.priority},${
                STATUS_LABELS[t.status]
              },${t.rootCause},${t.slaBreached ? 'Oui' : 'Non'}`
          )
          .join('\n');
    } else if (reportType === 'satisfaction') {
      csv =
        'Date,Catégorie,CSAT,NPS,CES,Commentaire\n' +
        data.surveys
          .map(
            (s) =>
              `${new Date(s.submittedAt).toISOString().slice(0, 10)},${s.category},${s.csatScore},${s.npsScore},${
                s.cesScore
              },"${s.comment.replace(/"/g, '""')}"`
          )
          .join('\n');
    } else if (reportType === 'agents') {
      csv =
        'Agent,Rôle,Tickets Assignés,Résolus\n' +
        data.members
          .map((m) => {
            const list = data.tickets.filter((t) => t.assignedUserId === m.userId);
            const res = list.filter((t) => t.status === 'RESOLU' || t.status === 'CLOTURE').length;
            return `"${m.fullName}",${m.jobTitle},${list.length},${res}`;
          })
          .join('\n');
    } else {
      csv =
        'Agence,Ville,Tickets,SLA Respecté\n' +
        data.agencies
          .map((a) => {
            const list = data.tickets.filter((t) => t.agencyId === a.id);
            const ok = list.filter((t) => !t.slaBreached).length;
            return `"${a.name}",${a.city},${list.length},${list.length ? Math.round((ok / list.length) * 100) : 100}%`;
          })
          .join('\n');
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport_${reportType}_${data.activeOrganization.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (mode === 'reports') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold">Rapports Professionnels & Exports</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Rapports périodiques configurables avec export CSV / Excel et impression PDF
            </p>
          </div>

          <div className="flex items-center gap-2 no-print">
            <button
              onClick={handleDownloadReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Télécharger CSV / Excel
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Exporter PDF
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit no-print">
          {[
            { id: 'tickets', label: 'Réclamations & SLA' },
            { id: 'satisfaction', label: 'Satisfaction CSAT/NPS' },
            { id: 'agents', label: 'Performance Agents' },
            { id: 'agencies', label: 'Agences & Sites' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setReportType(t.id as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                reportType === t.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">
              Aperçu du rapport — {data.activeOrganization.name}
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Généré le {new Date().toLocaleDateString('fr-FR')}
            </span>
          </div>

          <div className="overflow-x-auto">
            {reportType === 'tickets' && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-3 px-4 font-medium">Ticket</th>
                    <th className="py-3 px-4 font-medium">Sujet</th>
                    <th className="py-3 px-4 font-medium">Catégorie</th>
                    <th className="py-3 px-4 font-medium">Statut</th>
                    <th className="py-3 px-4 font-medium">Cause racine</th>
                    <th className="py-3 px-4 font-medium text-right">SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.tickets.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2.5 px-4 font-mono tabular-nums">{t.ticketNumber}</td>
                      <td className="py-2.5 px-4 font-medium">{t.subject}</td>
                      <td className="py-2.5 px-4">{t.category}</td>
                      <td className="py-2.5 px-4">{STATUS_LABELS[t.status]}</td>
                      <td className="py-2.5 px-4">{t.rootCause}</td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {t.slaBreached ? 'Dépassé' : 'Conforme'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'satisfaction' && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-3 px-4 font-medium">Date</th>
                    <th className="py-3 px-4 font-medium">Catégorie</th>
                    <th className="py-3 px-4 font-medium text-right">CSAT</th>
                    <th className="py-3 px-4 font-medium text-right">NPS</th>
                    <th className="py-3 px-4 font-medium text-right">CES</th>
                    <th className="py-3 px-4 font-medium">Commentaire</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.surveys.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        {new Date(s.submittedAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="py-2.5 px-4">{s.category}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{s.csatScore}/5</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{s.npsScore}/10</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{s.cesScore}/7</td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">{s.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'agents' && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-3 px-4 font-medium">Collaborateur</th>
                    <th className="py-3 px-4 font-medium">Rôle</th>
                    <th className="py-3 px-4 font-medium text-right">Tickets gérés</th>
                    <th className="py-3 px-4 font-medium text-right">Résolus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.members.map((m) => {
                    const list = data.tickets.filter((t) => t.assignedUserId === m.userId);
                    const res = list.filter((t) => t.status === 'RESOLU' || t.status === 'CLOTURE').length;
                    return (
                      <tr key={m.id}>
                        <td className="py-2.5 px-4 font-medium">{m.fullName}</td>
                        <td className="py-2.5 px-4">{ROLE_LABELS[m.role]}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{list.length}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{res}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {reportType === 'agencies' && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-3 px-4 font-medium">Agence</th>
                    <th className="py-3 px-4 font-medium">Ville</th>
                    <th className="py-3 px-4 font-medium">Responsable</th>
                    <th className="py-3 px-4 font-medium text-right">Volume tickets</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.agencies.map((ag) => (
                    <tr key={ag.id}>
                      <td className="py-2.5 px-4 font-medium">{ag.name}</td>
                      <td className="py-2.5 px-4">{ag.city}</td>
                      <td className="py-2.5 px-4">{ag.managerName}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {data.tickets.filter((t) => t.agencyId === ag.id).length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'super-admin') {
    const refreshSuperOverview = async (token: string) => {
      const updated = await apiRequest<typeof superOverview>('/api/super-admin/overview', {
        token,
        orgId: data.activeOrganization.id,
      });
      setSuperOverview(updated);
    };

    const handleCreateOrg = async (e: React.FormEvent) => {
      e.preventDefault();
      const token = await getToken();
      if (!token) return;
      await apiRequest('/api/super-admin/organizations', {
        method: 'POST',
        token,
        orgId: data.activeOrganization.id,
        body: { name: newOrgName, industry: newOrgIndustry, plan: newOrgPlan },
      });
      setNewOrgName('');
      await onRefresh();
      await refreshSuperOverview(token);
    };

    const handleToggleOrgStatus = async (orgId: number, currentStatus: string) => {
      const token = await getToken();
      if (!token) return;
      await apiRequest(`/api/super-admin/organizations/${orgId}`, {
        method: 'PATCH',
        token,
        orgId: data.activeOrganization.id,
        body: { status: currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' },
      });
      await refreshSuperOverview(token);
      await onRefresh();
    };

    const handleMarkInvoicePaid = async (invoiceId: number) => {
      const token = await getToken();
      if (!token) return;
      await apiRequest(`/api/super-admin/invoices/${invoiceId}/mark-paid`, {
        method: 'POST',
        token,
        orgId: data.activeOrganization.id,
      });
      await refreshSuperOverview(token);
      await onRefresh();
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold">Administration SaaS (Super Admin Fondateur)</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pilotage global des entreprises locataires, encaissements, MRR et passerelle Stripe
            </p>
          </div>
          <div className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            Passerelle Stripe :{' '}
            <span className={data.stripeConfigured ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
              {data.stripeConfigured ? 'Connectée (Live/Test)' : 'Mode Carte/SEPA intégré'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500">Revenu encaissé (TTC)</p>
            <p className="font-mono tabular-nums text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
              {formatCurrencyEUR(superOverview?.totalCollectedCents || 0)}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500">Revenu mensuel récurrent (MRR)</p>
            <p className="font-mono tabular-nums text-2xl font-bold mt-1">
              {formatCurrencyEUR(superOverview?.totalMrrCents || 0)}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500">Organisations hébergées</p>
            <p className="font-mono tabular-nums text-2xl font-bold mt-1">
              {superOverview?.organizations.length || 0}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500">Utilisateurs / Tickets globaux</p>
            <p className="font-mono tabular-nums text-2xl font-bold mt-1">
              {superOverview?.totalUsers || 0} / {superOverview?.totalTickets || 0}
            </p>
          </div>
        </div>

        <form
          onSubmit={handleCreateOrg}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-end gap-3 text-xs"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-slate-500 mb-1">Nouvelle organisation locataire *</label>
            <input
              required
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Ex. Groupe Lumière SAS"
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div className="w-48">
            <label className="block text-slate-500 mb-1">Secteur</label>
            <input
              value={newOrgIndustry}
              onChange={(e) => setNewOrgIndustry(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div className="w-40">
            <label className="block text-slate-500 mb-1">Offre</label>
            <select
              value={newOrgPlan}
              onChange={(e) => setNewOrgPlan(e.target.value as OrgPlan)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <option value="STARTER">STARTER</option>
              <option value="BUSINESS">BUSINESS</option>
              <option value="ENTERPRISE">ENTERPRISE</option>
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
          >
            Provisionner espace
          </button>
        </form>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-display text-sm font-semibold">Entreprises locataires</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                  <th className="py-3 px-4 font-medium">Entreprise</th>
                  <th className="py-3 px-4 font-medium">Plan</th>
                  <th className="py-3 px-4 font-medium">Statut</th>
                  <th className="py-3 px-4 font-medium text-right">MRR</th>
                  <th className="py-3 px-4 font-medium text-right">Tickets</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(superOverview?.organizations || []).map((org) => (
                  <tr key={org.id}>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{org.name}</p>
                      <p className="text-slate-500 font-mono text-[11px]">{org.slug}</p>
                    </td>
                    <td className="py-3 px-4 font-mono">{org.plan}</td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          org.status === 'ACTIVE'
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-amber-600 dark:text-amber-400 font-medium'
                        }
                      >
                        {org.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatCurrencyEUR(org.mrrCents)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{org.ticketCount}</td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => onSwitchOrg(org.id)}
                        className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Ouvrir espace
                      </button>
                      <button
                        onClick={() => handleToggleOrgStatus(org.id, org.status)}
                        className="text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
                      >
                        {org.status === 'ACTIVE' ? 'Suspendre' : 'Activer'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SaaS Invoices Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-display text-sm font-semibold">Factures & Encaissements SaaS</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                  <th className="py-3 px-4 font-medium">Facture</th>
                  <th className="py-3 px-4 font-medium">Organisation</th>
                  <th className="py-3 px-4 font-medium">Offre</th>
                  <th className="py-3 px-4 font-medium">Paiement</th>
                  <th className="py-3 px-4 font-medium text-right">Total TTC</th>
                  <th className="py-3 px-4 font-medium">Statut</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(superOverview?.invoices || []).map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-semibold">{inv.invoiceNumber}</td>
                    <td className="py-2.5 px-4">{inv.orgName}</td>
                    <td className="py-2.5 px-4 font-mono">
                      {inv.plan} · {inv.billingCycle === 'ANNUAL' ? 'Annuel' : 'Mensuel'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">{inv.paymentMethodSummary || inv.paymentProvider}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                      {formatCurrencyEUR(inv.totalCents)}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={
                          inv.status === 'PAID'
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : 'text-amber-600 dark:text-amber-400 font-semibold'
                        }
                      >
                        {inv.status === 'PAID' ? 'PAYÉE' : 'EN ATTENTE'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {inv.status === 'PENDING' ? (
                        <button
                          onClick={() => handleMarkInvoicePaid(inv.id)}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                        >
                          Valider paiement
                        </button>
                      ) : (
                        <span className="font-mono tabular-nums text-slate-400">
                          {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString('fr-FR') : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {(superOverview?.invoices || []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      Aucune facture enregistrée pour le moment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Organization, Multi-agency, Categories, Roles & Subscription Plans
  const handleAddAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;
    await apiRequest('/api/agencies', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: { name: agencyName, city: agencyCity },
    });
    setAgencyName('');
    setAgencyCity('');
    await onRefresh();
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;
    await apiRequest('/api/teams', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: { name: teamName },
    });
    setTeamName('');
    await onRefresh();
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    const token = await getToken();
    if (!token) return;
    try {
      await apiRequest('/api/members/invite', {
        method: 'POST',
        token,
        orgId: data.activeOrganization.id,
        body: { fullName: inviteName, email: inviteEmail, role: inviteRole },
      });
      setInviteName('');
      setInviteEmail('');
      await onRefresh();
    } catch (err: any) {
      setInviteError(err?.message || 'Impossible d’inviter ce collaborateur.');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;
    await apiRequest('/api/categories', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: {
        name: catName,
        subcategories: catSubs
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
    });
    setCatName('');
    setCatSubs('');
    await onRefresh();
  };

  const handleAddSubcategory = async (catId: number, currentSubs: string[]) => {
    const val = (newSubByCat[catId] || '').trim();
    if (!val) return;
    const token = await getToken();
    if (!token) return;
    await apiRequest(`/api/categories/${catId}`, {
      method: 'PATCH',
      token,
      orgId: data.activeOrganization.id,
      body: { subcategories: Array.from(new Set([...currentSubs, val])) },
    });
    setNewSubByCat((prev) => ({ ...prev, [catId]: '' }));
    await onRefresh();
  };

  const handleSavePortalSettings = async () => {
    const token = await getToken();
    if (!token) return;
    await apiRequest('/api/organization', {
      method: 'PATCH',
      token,
      orgId: data.activeOrganization.id,
      body: { portalTitle, primaryColor },
    });
    await onRefresh();
  };

  const handleRoleChange = async (memberId: number, role: OrgRole) => {
    const token = await getToken();
    if (!token) return;
    await apiRequest(`/api/members/${memberId}`, {
      method: 'PATCH',
      token,
      orgId: data.activeOrganization.id,
      body: { role },
    });
    await onRefresh();
  };

  const handleToggleAutoRenew = async () => {
    const token = await getToken();
    if (!token) return;
    await apiRequest('/api/billing/cancel', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: { cancelAtPeriodEnd: !data.activeOrganization.cancelAtPeriodEnd },
    });
    await onRefresh();
  };

  const handleCompleteCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    setCheckoutSuccess(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Session expirée.');
      const res = await apiRequest<{
        provider: 'STRIPE' | 'BUILTIN';
        checkoutUrl?: string;
        invoice?: Invoice;
      }>('/api/billing/checkout', {
        method: 'POST',
        token,
        orgId: data.activeOrganization.id,
        body: {
          plan: checkoutPlan,
          billingCycle,
          billingEmail,
          paymentMethod,
          cardLast4: cardNumber.replace(/\D/g, '').slice(-4),
          cardBrand: cardNumber.trim().startsWith('5') ? 'Mastercard' : 'Visa Corporate',
          ibanLast4: ibanValue.replace(/\s+/g, '').slice(-4),
        },
      });
      if (res.provider === 'STRIPE' && res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      setCheckoutPlan(null);
      setCheckoutSuccess(
        `Paiement confirmé (${res.invoice?.invoiceNumber}). Abonnement ${checkoutPlan} activé.`
      );
      await onRefresh();
    } catch (err: any) {
      setCheckoutError(err?.message || 'Erreur lors du paiement.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const checkoutPricing = checkoutPlan
    ? (() => {
        const spec = PLAN_PRICING[checkoutPlan];
        const ht = billingCycle === 'ANNUAL' ? spec.annualMonthlyCents * 12 : spec.monthlyCents;
        const tax = Math.round(ht * 0.2);
        return { ht, tax, ttc: ht + tax };
      })()
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Organisation, Abonnement & Facturation</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {data.activeOrganization.name} · Plan {data.activeOrganization.plan} · Statut :{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {data.activeOrganization.status}
            </span>
          </p>
        </div>
        <div className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          Passerelle Stripe :{' '}
          <span className={data.stripeConfigured ? 'text-emerald-600 font-semibold' : 'text-slate-600 dark:text-slate-300 font-medium'}>
            {data.stripeConfigured ? 'Stripe Checkout actif' : 'Paiement Carte / SEPA intégré'}
          </span>
        </div>
      </div>

      {checkoutSuccess && (
        <div className="p-3.5 text-xs border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 rounded-xl flex items-center justify-between">
          <span>{checkoutSuccess}</span>
          <button onClick={() => setCheckoutSuccess(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Subscription Plans */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold">Offres & Abonnement SaaS</h2>
            <p className="text-xs text-slate-500">
              Quotas agents appliqués en temps réel · Facturation automatisée avec TVA 20%
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              className={`px-3 py-1 rounded-md cursor-pointer ${
                billingCycle === 'MONTHLY' ? 'bg-white dark:bg-slate-900 font-semibold shadow-xs' : 'text-slate-500'
              }`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setBillingCycle('ANNUAL')}
              className={`px-3 py-1 rounded-md cursor-pointer ${
                billingCycle === 'ANNUAL' ? 'bg-white dark:bg-slate-900 font-semibold shadow-xs' : 'text-slate-500'
              }`}
            >
              Annuel (-18%)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['STARTER', 'BUSINESS', 'ENTERPRISE'] as OrgPlan[]).map((planId) => {
            const p = PLAN_PRICING[planId];
            const isCurrent =
              data.activeOrganization.plan === planId && data.activeOrganization.status === 'ACTIVE';
            const displayPrice =
              billingCycle === 'ANNUAL' ? formatCurrencyEUR(p.annualMonthlyCents) : formatCurrencyEUR(p.monthlyCents);

            return (
              <div
                key={planId}
                className={`p-4 rounded-xl border space-y-3 ${
                  data.activeOrganization.plan === planId
                    ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm">{planId}</span>
                  <span className="font-mono tabular-nums font-bold text-base">{displayPrice}/mois</span>
                </div>
                <p className="text-xs text-slate-500">{p.audience}</p>
                <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {p.limits.map((l) => (
                    <li key={l} className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      {l}
                    </li>
                  ))}
                </ul>
                {canManageOrg && (
                  <button
                    onClick={() => {
                      setCheckoutError(null);
                      setCheckoutPlan(planId);
                    }}
                    className={`w-full py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                      isCurrent
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                    }`}
                  >
                    {isCurrent
                      ? 'Plan actif (Renouveler / Changer)'
                      : data.activeOrganization.status === 'TRIAL' && data.activeOrganization.plan === planId
                      ? `Activer & payer ${planId}`
                      : `Souscrire au plan ${planId}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing Status & Invoices */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold flex items-center gap-2">
              <Receipt className="w-4 h-4 text-slate-400" />
              Moyen de paiement & Historique des Factures ({data.invoices.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {data.activeOrganization.paymentMethodBrand
                ? `Moyen enregistré : ${data.activeOrganization.paymentMethodBrand} •••• ${data.activeOrganization.paymentMethodLast4}`
                : 'Aucun moyen de paiement enregistré (période d’essai)'}
              {data.activeOrganization.nextBillingAt &&
                ` · Prochaine échéance : ${new Date(data.activeOrganization.nextBillingAt).toLocaleDateString('fr-FR')}`}
            </p>
          </div>
          {canManageOrg && data.activeOrganization.status === 'ACTIVE' && (
            <button
              onClick={handleToggleAutoRenew}
              className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {data.activeOrganization.cancelAtPeriodEnd
                ? 'Réactiver le renouvellement auto'
                : 'Suspendre le renouvellement auto'}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                <th className="py-2.5 px-3 font-medium">N° Facture</th>
                <th className="py-2.5 px-3 font-medium">Plan & Cycle</th>
                <th className="py-2.5 px-3 font-medium">Règlement</th>
                <th className="py-2.5 px-3 font-medium text-right">HT</th>
                <th className="py-2.5 px-3 font-medium text-right">TVA 20%</th>
                <th className="py-2.5 px-3 font-medium text-right">TTC</th>
                <th className="py-2.5 px-3 font-medium">Statut</th>
                <th className="py-2.5 px-3 font-medium text-right">Document</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2.5 px-3 font-mono tabular-nums font-semibold">{inv.invoiceNumber}</td>
                  <td className="py-2.5 px-3">
                    {inv.plan} ({inv.billingCycle === 'ANNUAL' ? 'Annuel' : 'Mensuel'})
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">{inv.paymentMethodSummary || inv.paymentProvider}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatCurrencyEUR(inv.amountCents)}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatCurrencyEUR(inv.taxCents)}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                    {formatCurrencyEUR(inv.totalCents)}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={
                        inv.status === 'PAID'
                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          : 'text-amber-600 dark:text-amber-400 font-semibold'
                      }
                    >
                      {inv.status === 'PAID' ? 'PAYÉE' : 'EN ATTENTE'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => setSelectedInvoice(inv)}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                    >
                      Voir / Imprimer
                    </button>
                  </td>
                </tr>
              ))}
              {data.invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    Aucune facture émise pour cette organisation. Souscrivez à un plan ci-dessus pour générer votre première facture.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agencies, Teams, Collaborators */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="font-display text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-400" />
            Collaborateurs, Rôles & Quota ({data.members.length}/{data.activeOrganization.maxAgents})
          </h2>

          {inviteError && (
            <div className="p-3 text-xs border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{inviteError}</span>
            </div>
          )}

          {canManageOrg && (
            <form onSubmit={handleInvite} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <input
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Nom complet"
                className="px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
              />
              <input
                required
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email"
                className="px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                className="px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
              >
                <option value="ORG_ADMIN">Admin entreprise</option>
                <option value="CS_MANAGER">Responsable SAV</option>
                <option value="AGENT">Agent</option>
                <option value="ANALYST">Analyste lecture seule</option>
              </select>
              <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white font-semibold rounded-md cursor-pointer">
                Inviter
              </button>
            </form>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.members.map((m) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold">
                    {m.fullName}{' '}
                    {m.status === 'INVITED' && (
                      <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">(Invité)</span>
                    )}
                  </p>
                  <p className="text-slate-500 font-mono text-[11px]">{m.email}</p>
                </div>
                {canManageOrg ? (
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value as OrgRole)}
                    className="px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    <option value="ORG_ADMIN">Admin entreprise</option>
                    <option value="CS_MANAGER">Responsable SAV</option>
                    <option value="AGENT">Agent</option>
                    <option value="ANALYST">Analyste</option>
                  </select>
                ) : (
                  <span className="text-slate-500">{ROLE_LABELS[m.role]}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 space-y-5">
          {/* Agencies & Teams */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-sm font-semibold flex items-center gap-2">
              <Building className="w-4 h-4 text-slate-400" />
              Agences, Sites & Équipes
            </h2>
            {canManageOrg && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <form onSubmit={handleAddAgency} className="flex gap-1.5">
                  <input
                    required
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    placeholder="Nouvelle agence"
                    className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  />
                  <input
                    required
                    value={agencyCity}
                    onChange={(e) => setAgencyCity(e.target.value)}
                    placeholder="Ville"
                    className="w-24 px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  />
                  <button className="px-2.5 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold rounded-md cursor-pointer">
                    +
                  </button>
                </form>

                <form onSubmit={handleAddTeam} className="flex gap-1.5">
                  <input
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Nouvelle équipe"
                    className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  />
                  <button className="px-2.5 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold rounded-md cursor-pointer">
                    +
                  </button>
                </form>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-xs pt-2">
              <div>
                <p className="font-semibold text-slate-500 mb-1">Agences ({data.agencies.length})</p>
                <ul className="space-y-1">
                  {data.agencies.map((a) => (
                    <li key={a.id}>
                      {a.name} · <span className="text-slate-500">{a.city}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-500 mb-1">Équipes ({data.teams.length})</p>
                <ul className="space-y-1">
                  {data.teams.map((t) => (
                    <li key={t.id}>{t.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Custom Categories & Portal Branding */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-sm font-semibold">
              Catégories SAV, Sous-domaines & Portail ({data.categories.length})
            </h2>
            {canManageOrg && (
              <form onSubmit={handleAddCategory} className="flex flex-wrap gap-2 text-xs">
                <input
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Nouvelle catégorie (ex. Certification)"
                  className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                />
                <input
                  value={catSubs}
                  onChange={(e) => setCatSubs(e.target.value)}
                  placeholder="Sous-domaines (séparés par virgule)"
                  className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                />
                <button className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white font-semibold rounded-md cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter
                </button>
              </form>
            )}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto text-xs">
              {data.categories.map((c) => (
                <div key={c.id} className="py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{c.name}</span>
                    {canManageOrg && (
                      <div className="flex items-center gap-1">
                        <input
                          value={newSubByCat[c.id] || ''}
                          onChange={(e) => setNewSubByCat((p) => ({ ...p, [c.id]: e.target.value }))}
                          placeholder="+ sous-domaine"
                          className="w-32 px-2 py-0.5 text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddSubcategory(c.id, c.subcategories)}
                          className="px-2 py-0.5 text-[11px] font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {c.subcategories.length ? c.subcategories.join(' · ') : 'Aucun sous-domaine'}
                  </p>
                </div>
              ))}
            </div>

            {canManageOrg && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
                <input
                  value={portalTitle}
                  onChange={(e) => setPortalTitle(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  placeholder="Titre du portail client"
                />
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-9 h-8 rounded cursor-pointer border border-slate-200 dark:border-slate-700"
                />
                <button
                  onClick={handleSavePortalSettings}
                  className="px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold rounded-md cursor-pointer"
                >
                  Enregistrer marque blanche
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity Audit Logs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h2 className="font-display text-sm font-semibold mb-3">Journal d’audit & Historique des activités</h2>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto text-xs">
          {data.activityLogs.map((log) => (
            <div key={log.id} className="py-2 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="font-semibold text-slate-900 dark:text-white">{log.actorName}</span>{' '}
                <span className="text-slate-500">· {log.action} ·</span>{' '}
                <span className="font-mono text-slate-700 dark:text-slate-300">{log.targetId}</span>
                {log.details && <span className="text-slate-500"> — {log.details}</span>}
              </div>
              <span className="font-mono tabular-nums text-slate-400 shrink-0">
                {new Date(log.createdAt).toLocaleString('fr-FR')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Real B2B Checkout Modal */}
      {checkoutPlan && checkoutPricing && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <h3 className="font-display text-base font-bold">
                  Règlement Abonnement — {checkoutPlan}
                </h3>
              </div>
              <button onClick={() => setCheckoutPlan(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">
                  Offre {checkoutPlan} ({billingCycle === 'ANNUAL' ? 'Facturation annuelle -18%' : 'Facturation mensuelle'})
                </span>
                <span className="font-mono tabular-nums">{formatCurrencyEUR(checkoutPricing.ht)} HT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">TVA française (20 %)</span>
                <span className="font-mono tabular-nums">{formatCurrencyEUR(checkoutPricing.tax)}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-slate-800 font-semibold text-sm">
                <span>Total à régler TTC</span>
                <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
                  {formatCurrencyEUR(checkoutPricing.ttc)}
                </span>
              </div>
            </div>

            {checkoutError && (
              <div className="p-2.5 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-lg">
                {checkoutError}
              </div>
            )}

            <form onSubmit={handleCompleteCheckout} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Email de facturation (envoi facture PDF)</label>
                <input
                  required
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Mode de paiement</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CARD')}
                    className={`py-2 px-2 rounded-lg border font-medium cursor-pointer ${
                      paymentMethod === 'CARD'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Carte Bancaire
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('SEPA')}
                    className={`py-2 px-2 rounded-lg border font-medium cursor-pointer ${
                      paymentMethod === 'SEPA'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Mandat SEPA
                  </button>
                  <button
                    type="button"
                    disabled={!data.stripeConfigured}
                    onClick={() => setPaymentMethod('STRIPE')}
                    className={`py-2 px-2 rounded-lg border font-medium cursor-pointer disabled:opacity-50 ${
                      paymentMethod === 'STRIPE'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Stripe Checkout
                  </button>
                </div>
                {!data.stripeConfigured && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Ajoutez <span className="font-mono">STRIPE_SECRET_KEY</span> dans vos Secrets serveur pour rediriger vers Stripe Checkout réel.
                  </p>
                )}
              </div>

              {paymentMethod === 'CARD' && (
                <div className="space-y-2.5 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                  <div>
                    <label className="block text-slate-500 mb-1">Titulaire de la carte</label>
                    <input
                      required
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                    />
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-7">
                      <label className="block text-slate-500 mb-1">Numéro de carte</label>
                      <input
                        required
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-slate-500 mb-1">Exp.</label>
                      <input
                        required
                        value={cardExp}
                        onChange={(e) => setCardExp(e.target.value)}
                        className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-slate-500 mb-1">CVC</label>
                      <input
                        required
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'SEPA' && (
                <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                  <label className="block text-slate-500 mb-1">IBAN Entreprise (Mandat SEPA B2B)</label>
                  <input
                    required
                    value={ibanValue}
                    onChange={(e) => setIbanValue(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCheckoutPlan(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={checkoutLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer disabled:opacity-60"
                >
                  <Lock className="w-3.5 h-3.5" />
                  {checkoutLoading
                    ? 'Traitement...'
                    : `Confirmer et payer ${formatCurrencyEUR(checkoutPricing.ttc)} TTC`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Printable Invoice Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full p-8 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <p className="font-display text-lg font-bold">ClientPulse 360 SAS</p>
                <p className="text-xs text-slate-500">Plateforme SaaS B2B · Relation Client & Qualité SAV</p>
              </div>
              <div className="text-right">
                <p className="font-display text-base font-bold">FACTURE</p>
                <p className="font-mono text-xs text-slate-600 dark:text-slate-400">
                  {selectedInvoice.invoiceNumber}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <p className="text-slate-500 mb-1">Facturé à :</p>
                <p className="font-semibold text-sm">{data.activeOrganization.name}</p>
                <p className="text-slate-600 dark:text-slate-400">
                  {data.activeOrganization.billingEmail || data.currentUser.email}
                </p>
              </div>
              <div className="text-right space-y-1">
                <p>
                  <span className="text-slate-500">Date d’émission : </span>
                  <span className="font-mono">{new Date(selectedInvoice.createdAt).toLocaleDateString('fr-FR')}</span>
                </p>
                <p>
                  <span className="text-slate-500">Période : </span>
                  <span className="font-mono">
                    {new Date(selectedInvoice.periodStart).toLocaleDateString('fr-FR')} →{' '}
                    {new Date(selectedInvoice.periodEnd).toLocaleDateString('fr-FR')}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Règlement : </span>
                  <span>{selectedInvoice.paymentMethodSummary || selectedInvoice.paymentProvider}</span>
                </p>
              </div>
            </div>

            <table className="w-full text-xs border border-slate-200 dark:border-slate-800">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-left">
                  <th className="py-2.5 px-3 font-medium">Désignation</th>
                  <th className="py-2.5 px-3 font-medium text-right">Montant HT</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-3 px-3">
                    Abonnement ClientPulse 360 — Offre {selectedInvoice.plan} (
                    {selectedInvoice.billingCycle === 'ANNUAL' ? 'Annuel' : 'Mensuel'})
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {formatCurrencyEUR(selectedInvoice.amountCents)}
                  </td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2.5 px-3 text-slate-500">TVA (20%)</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {formatCurrencyEUR(selectedInvoice.taxCents)}
                  </td>
                </tr>
                <tr className="font-bold text-sm">
                  <td className="py-3 px-3">Total TTC ({selectedInvoice.status === 'PAID' ? 'PAYÉ' : 'À PAYER'})</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {formatCurrencyEUR(selectedInvoice.totalCents)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="flex items-center justify-end gap-2 no-print">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimer / PDF
              </button>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
