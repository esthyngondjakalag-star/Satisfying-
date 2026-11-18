import React, { useMemo, useState } from 'react';
import {
  Plus,
  AlertCircle,
  Send,
  Copy,
  ExternalLink,
  ClipboardList,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { ROOT_CAUSES, SurveyQuestion, WorkspaceBootstrap } from '../../types/workspace';
import { HorizontalDistributionList } from '../Charts';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/apiClient';
import { PublicSurveyRunner } from '../PublicSurveyRunner';

export function SatisfactionRootCauseView({
  data,
  mode,
  onRefresh,
  onSelectTicket,
}: {
  data: WorkspaceBootstrap;
  mode: 'satisfaction' | 'root-causes';
  onRefresh: () => Promise<void>;
  onSelectTicket: (ticketId: number) => void;
}) {
  const { getToken } = useAuth();
  const [subTab, setSubTab] = useState<'analytics' | 'dispatch' | 'templates'>('analytics');

  // Direct manual recording modal
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [ticketId, setTicketId] = useState<number>(data.tickets[0]?.id || 0);
  const [csatScore, setCsatScore] = useState(5);
  const [npsScore, setNpsScore] = useState(9);
  const [cesScore, setCesScore] = useState(6);
  const [comment, setComment] = useState('');

  // Dispatch / Send survey invitation state
  const [invTemplateId, setInvTemplateId] = useState<number>(data.surveyTemplates[0]?.id || 0);
  const [invCustomerId, setInvCustomerId] = useState<number>(data.customers[0]?.id || 0);
  const [invTicketId, setInvTicketId] = useState<string>('');
  const [invChannel, setInvChannel] = useState<'EMAIL' | 'LINK' | 'WHATSAPP'>('EMAIL');
  const [lastCreatedLink, setLastCreatedLink] = useState<{ token: string; url: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [previewSurveyToken, setPreviewSurveyToken] = useState<string | null>(null);

  // Create custom survey template state
  const [tplTitle, setTplTitle] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [tplCategory, setTplCategory] = useState('ALL');
  const [tplCsat, setTplCsat] = useState(true);
  const [tplNps, setTplNps] = useState(true);
  const [tplCes, setTplCes] = useState(true);
  const [tplQuestions, setTplQuestions] = useState<SurveyQuestion[]>([
    {
      id: 'q-1',
      label: 'La qualité globale du service après-vente était-elle à la hauteur de vos attentes ?',
      type: 'RATING_5',
      required: true,
    },
  ]);

  const isReadOnly = data.currentUser.activeRole === 'ANALYST';
  const canManageTemplates = ['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN'].includes(data.currentUser.activeRole);

  const metrics = useMemo(() => {
    const s = data.surveys;
    const avgCsat = s.length ? (s.reduce((a, x) => a + x.csatScore, 0) / s.length).toFixed(2) : '0.00';
    const avgCes = s.length ? (s.reduce((a, x) => a + x.cesScore, 0) / s.length).toFixed(1) : '0.0';
    const promoters = s.filter((x) => x.npsScore >= 9).length;
    const detractors = s.filter((x) => x.npsScore <= 6).length;
    const nps = s.length ? Math.round(((promoters - detractors) / s.length) * 100) : 0;
    return { avgCsat, avgCes, nps, promoters, detractors };
  }, [data.surveys]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number[]>();
    data.surveys.forEach((s) => {
      const arr = map.get(s.category) || [];
      arr.push(s.csatScore);
      map.set(s.category, arr);
    });
    return Array.from(map.entries()).map(([label, scores]) => ({
      label,
      value: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
    }));
  }, [data.surveys]);

  const byAgency = useMemo(() => {
    return data.agencies.map((ag) => {
      const list = data.surveys.filter((s) => s.agencyId === ag.id);
      const avg = list.length ? Number((list.reduce((a, s) => a + s.csatScore, 0) / list.length).toFixed(2)) : 0;
      return { label: ag.name, sublabel: `${list.length} avis`, value: avg };
    });
  }, [data.agencies, data.surveys]);

  const dissatisfied = useMemo(() => {
    return data.surveys
      .filter((s) => s.csatScore <= 3)
      .map((s) => ({
        survey: s,
        customer: data.customers.find((c) => c.id === s.customerId),
        ticket: data.tickets.find((t) => t.id === s.ticketId),
      }));
  }, [data.surveys, data.customers, data.tickets]);

  const rootCauseAnalysis = useMemo(() => {
    return ROOT_CAUSES.filter((rc) => rc !== 'Non définie')
      .map((rc) => {
        const list = data.tickets.filter((t) => t.rootCause === rc);
        const ticketIds = new Set(list.map((t) => t.id));
        const relSurveys = data.surveys.filter((s) => s.ticketId != null && ticketIds.has(s.ticketId));
        const avgCsat = relSurveys.length
          ? (relSurveys.reduce((a, s) => a + s.csatScore, 0) / relSurveys.length).toFixed(1)
          : '—';
        const teamsMap = new Map<string, number>();
        list.forEach((t) => {
          const team = data.teams.find((tm) => tm.id === t.teamId)?.name || 'Non affecté';
          teamsMap.set(team, (teamsMap.get(team) || 0) + 1);
        });
        const topTeam = Array.from(teamsMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
        return {
          rootCause: rc,
          count: list.length,
          breached: list.filter((t) => t.slaBreached).length,
          avgCsat,
          topTeam,
        };
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [data.tickets, data.surveys, data.teams]);

  const handleSubmitSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    if (!token || !ticketId) return;
    await apiRequest('/api/surveys', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: { ticketId, csatScore, npsScore, cesScore, comment },
    });
    setShowSurveyModal(false);
    setComment('');
    await onRefresh();
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    const tplId = invTemplateId || data.surveyTemplates[0]?.id;
    const custId = invCustomerId || data.customers[0]?.id;
    if (!token || !tplId || !custId) return;

    const res = await apiRequest<{ token: string; surveyUrlPath: string }>('/api/survey-invitations', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: {
        templateId: tplId,
        customerId: custId,
        ticketId: invTicketId ? Number(invTicketId) : null,
        channel: invChannel,
      },
    });
    setLastCreatedLink({ token: res.token, url: `${window.location.origin}${res.surveyUrlPath}` });
    await onRefresh();
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    if (!token || !tplTitle.trim()) return;
    await apiRequest('/api/survey-templates', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: {
        title: tplTitle,
        description: tplDesc,
        targetCategory: tplCategory,
        includeCsat: tplCsat,
        includeNps: tplNps,
        includeCes: tplCes,
        questions: tplQuestions.filter((q) => q.label.trim()),
      },
    });
    setTplTitle('');
    setTplDesc('');
    setTplQuestions([{ id: `q-${Date.now()}`, label: '', type: 'RATING_5', required: true }]);
    await onRefresh();
  };

  const handleToggleTemplate = async (id: number, currentActive: boolean) => {
    const token = await getToken();
    if (!token) return;
    await apiRequest(`/api/survey-templates/${id}`, {
      method: 'PATCH',
      token,
      orgId: data.activeOrganization.id,
      body: { isActive: !currentActive },
    });
    await onRefresh();
  };

  if (mode === 'root-causes') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-xl font-bold">Analyse des Causes Racines</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Identification des causes récurrentes, départements responsables et impact sur la satisfaction
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display text-sm font-semibold mb-4">Pareto des causes racines</h2>
            <HorizontalDistributionList
              items={rootCauseAnalysis.map((r) => ({
                label: r.rootCause,
                sublabel: r.topTeam,
                value: r.count,
              }))}
              accentClass="bg-amber-600 dark:bg-amber-500"
              valueFormatter={(v) => `${v} dossier${v > 1 ? 's' : ''}`}
            />
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-display text-sm font-semibold">Impact qualité & responsabilités</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-left">
                    <th className="py-3 px-4 font-medium">Cause racine</th>
                    <th className="py-3 px-4 font-medium">Équipe principale</th>
                    <th className="py-3 px-4 font-medium text-right">Volume</th>
                    <th className="py-3 px-4 font-medium text-right">SLA dépassés</th>
                    <th className="py-3 px-4 font-medium text-right">CSAT moyen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rootCauseAnalysis.map((r) => (
                    <tr key={r.rootCause} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{r.rootCause}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{r.topTeam}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{r.count}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                        {r.breached}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {r.avgCsat}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Sondages Clients & Satisfaction (CSAT, NPS, CES)</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Créez vos questionnaires sur mesure (SAV, Certifications, Formation), envoyez des liens clients et analysez les retours
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isReadOnly && (
            <>
              <button
                onClick={() => setSubTab('dispatch')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                Faire passer un sondage
              </button>
              <button
                onClick={() => setShowSurveyModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Saisie manuelle
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
        {[
          { id: 'analytics', label: `Analyse & Réponses (${data.surveys.length})` },
          { id: 'dispatch', label: `Envoyer & Suivre les sondages (${data.surveyInvitations.length})` },
          { id: 'templates', label: `Modèles de questionnaires (${data.surveyTemplates.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id as any)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
              subTab === t.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showSurveyModal && (
        <form
          onSubmit={handleSubmitSurvey}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <h2 className="font-display text-sm font-semibold">Saisie directe d’une réponse client</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Ticket concerné</label>
              <select
                value={ticketId}
                onChange={(e) => setTicketId(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                {data.tickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.ticketNumber} — {t.subject.slice(0, 32)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1">CSAT (1 à 5) : {csatScore}</label>
              <input
                type="range"
                min={1}
                max={5}
                value={csatScore}
                onChange={(e) => setCsatScore(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">NPS (0 à 10) : {npsScore}</label>
              <input
                type="range"
                min={0}
                max={10}
                value={npsScore}
                onChange={(e) => setNpsScore(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">CES (1 à 7) : {cesScore}</label>
              <input
                type="range"
                min={1}
                max={7}
                value={cesScore}
                onChange={(e) => setCesScore(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Commentaire libre du client..."
            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowSurveyModal(false)}
              className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
            >
              Enregistrer l’avis
            </button>
          </div>
        </form>
      )}

      {subTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">CSAT Moyen (1-5)</p>
              <p className="font-mono tabular-nums text-3xl font-bold mt-1">{metrics.avgCsat} / 5</p>
              <p className="text-xs text-slate-500 mt-1">{data.surveys.length} réponses collectées</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Net Promoter Score (NPS)</p>
              <p className="font-mono tabular-nums text-3xl font-bold mt-1">
                {metrics.nps > 0 ? `+${metrics.nps}` : metrics.nps}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {metrics.promoters} promoteurs · {metrics.detractors} détracteurs
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Customer Effort Score (CES 1-7)</p>
              <p className="font-mono tabular-nums text-3xl font-bold mt-1">{metrics.avgCes} / 7</p>
              <p className="text-xs text-slate-500 mt-1">Facilité de résolution perçue</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display text-sm font-semibold mb-4">CSAT par catégorie SAV</h2>
              <HorizontalDistributionList
                items={byCategory}
                accentClass="bg-emerald-600 dark:bg-emerald-500"
                valueFormatter={(v) => `${v} / 5`}
              />
            </div>

            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display text-sm font-semibold mb-4">CSAT par agence</h2>
              <HorizontalDistributionList
                items={byAgency}
                accentClass="bg-blue-600 dark:bg-blue-500"
                valueFormatter={(v) => `${v} / 5`}
              />
            </div>

            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                Alertes clients insatisfaits
              </h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {dissatisfied.map(({ survey, customer, ticket }) => (
                  <div key={survey.id} className="py-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {customer?.fullName || 'Client'}
                      </span>
                      <span className="font-mono tabular-nums text-red-600 dark:text-red-400 font-semibold">
                        CSAT {survey.csatScore}/5 · NPS {survey.npsScore}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">{survey.comment || 'Sans commentaire'}</p>
                    {ticket && (
                      <button
                        onClick={() => onSelectTicket(ticket.id)}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-mono cursor-pointer"
                      >
                        Ouvrir {ticket.ticketNumber} →
                      </button>
                    )}
                  </div>
                ))}
                {dissatisfied.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-500">Aucune alerte insatisfaction.</p>
                )}
              </div>
            </div>
          </div>

          {/* Detailed responses including custom questions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-display text-sm font-semibold">Dernières réponses détaillées aux sondages</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.surveys.map((s) => {
                const cust = data.customers.find((c) => c.id === s.customerId);
                const tkt = s.ticketId ? data.tickets.find((t) => t.id === s.ticketId) : undefined;
                return (
                  <div key={s.id} className="p-4 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {cust?.fullName || 'Client'}
                        </span>
                        <span className="text-slate-500">
                          {' '}
                          · {s.category}
                          {tkt ? ` · ${tkt.ticketNumber}` : ''}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        CSAT {s.csatScore}/5 · NPS {s.npsScore}/10 · CES {s.cesScore}/7 ·{' '}
                        {new Date(s.submittedAt).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    {s.comment && <p className="text-slate-700 dark:text-slate-300">« {s.comment} »</p>}
                    {s.customAnswers && s.customAnswers.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                        {s.customAnswers.map((ans, idx) => (
                          <div
                            key={idx}
                            className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md"
                          >
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{ans.label}</p>
                            <p className="font-medium text-slate-900 dark:text-white mt-0.5">{ans.answer}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {subTab === 'dispatch' && (
        <div className="space-y-6">
          {!isReadOnly && (
            <form
              onSubmit={handleCreateInvitation}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              <h2 className="font-display text-sm font-semibold">
                Envoyer un lien de sondage personnalisé à un client
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">Questionnaire / Modèle *</label>
                  <select
                    value={invTemplateId || data.surveyTemplates[0]?.id || ''}
                    onChange={(e) => setInvTemplateId(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {data.surveyTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.title} ({tpl.targetCategory === 'ALL' ? 'Général' : tpl.targetCategory})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Client destinataire *</label>
                  <select
                    value={invCustomerId || data.customers[0]?.id || ''}
                    onChange={(e) => setInvCustomerId(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {data.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.companyName || c.customerType})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Dossier / Ticket associé (optionnel)</label>
                  <select
                    value={invTicketId}
                    onChange={(e) => setInvTicketId(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="">Sondage indépendant / Campagne</option>
                    {data.tickets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.ticketNumber} · {t.category}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Canal d’envoi</label>
                  <select
                    value={invChannel}
                    onChange={(e) => setInvChannel(e.target.value as 'EMAIL' | 'LINK' | 'WHATSAPP')}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="EMAIL">Email client</option>
                    <option value="LINK">Lien direct / Portail</option>
                    <option value="WHATSAPP">WhatsApp Business</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Générer et envoyer le sondage
                </button>
              </div>

              {lastCreatedLink && (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                      Lien de sondage prêt à partager au client :
                    </p>
                    <p className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300 truncate">
                      {lastCreatedLink.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(lastCreatedLink.url);
                        setCopiedToken(lastCreatedLink.token);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 font-medium bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-md cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedToken === lastCreatedLink.token ? 'Copié' : 'Copier le lien'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewSurveyToken(lastCreatedLink.token)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold bg-emerald-600 text-white rounded-md cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Ouvrir comme un client
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          {/* Invitations Tracking Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-display text-sm font-semibold">Suivi des sondages envoyés aux clients</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-3 px-4 font-medium">Client</th>
                    <th className="py-3 px-4 font-medium">Questionnaire</th>
                    <th className="py-3 px-4 font-medium">Dossier</th>
                    <th className="py-3 px-4 font-medium">Canal</th>
                    <th className="py-3 px-4 font-medium">Statut</th>
                    <th className="py-3 px-4 font-medium text-right">Actions client</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.surveyInvitations.map((inv) => {
                    const cust = data.customers.find((c) => c.id === inv.customerId);
                    const tpl = data.surveyTemplates.find((t) => t.id === inv.templateId);
                    const tkt = inv.ticketId ? data.tickets.find((t) => t.id === inv.ticketId) : undefined;
                    const fullUrl = `${window.location.origin}/?survey=${inv.token}`;
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                          {cust?.fullName || 'Client'}
                          <span className="block text-[11px] text-slate-500">{cust?.companyName}</span>
                        </td>
                        <td className="py-3 px-4">{tpl?.title || 'Questionnaire'}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                          {tkt ? `${tkt.ticketNumber} (${tkt.category})` : 'Campagne directe'}
                        </td>
                        <td className="py-3 px-4 font-mono">{inv.channel}</td>
                        <td className="py-3 px-4">
                          {inv.status === 'COMPLETED' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Complété
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">En attente client</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(fullUrl);
                              setCopiedToken(inv.token);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedToken === inv.token ? 'Copié' : 'Copier lien'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewSurveyToken(inv.token)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold rounded-md cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {inv.status === 'COMPLETED' ? 'Voir' : 'Répondre / Tester'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {data.surveyInvitations.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Aucun sondage envoyé pour le moment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'templates' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.surveyTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-mono text-blue-600 dark:text-blue-400 font-semibold">
                        Cible : {tpl.targetCategory === 'ALL' ? 'Toutes catégories SAV' : tpl.targetCategory}
                      </p>
                      <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                        {tpl.title}
                      </h3>
                    </div>
                    {canManageTemplates && (
                      <button
                        type="button"
                        onClick={() => handleToggleTemplate(tpl.id, tpl.isActive)}
                        className={`px-2 py-1 text-[11px] font-medium rounded border cursor-pointer ${
                          tpl.isActive
                            ? 'border-emerald-300 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-300 text-slate-500'
                        }`}
                      >
                        {tpl.isActive ? 'Actif' : 'Inactif'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{tpl.description}</p>
                  <p className="text-[11px] font-mono text-slate-500">
                    Indicateurs : {[tpl.includeCsat && 'CSAT', tpl.includeNps && 'NPS', tpl.includeCes && 'CES'].filter(Boolean).join(' · ')}
                  </p>
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Questions personnalisées ({tpl.questions.length}) :
                    </p>
                    <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                      {tpl.questions.map((q) => (
                        <li key={q.id} className="truncate">
                          • {q.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setInvTemplateId(tpl.id);
                      setSubTab('dispatch');
                    }}
                    className="w-full py-2 text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Utiliser ce modèle
                  </button>
                )}
              </div>
            ))}
          </div>

          {canManageTemplates && (
            <form
              onSubmit={handleCreateTemplate}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              <h2 className="font-display text-sm font-semibold">Créer un nouveau modèle de sondage</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">Titre du questionnaire *</label>
                  <input
                    required
                    value={tplTitle}
                    onChange={(e) => setTplTitle(e.target.value)}
                    placeholder="Ex. Sondage Audit Certification Qualité"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Catégorie SAV ciblée</label>
                  <select
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="ALL">Toutes catégories</option>
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Description affichée au client</label>
                  <input
                    value={tplDesc}
                    onChange={(e) => setTplDesc(e.target.value)}
                    placeholder="Ex. Votre avis en 1 minute suite à votre dossier..."
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={tplCsat} onChange={(e) => setTplCsat(e.target.checked)} />
                  Inclure score CSAT (1-5)
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={tplNps} onChange={(e) => setTplNps(e.target.checked)} />
                  Inclure score NPS (0-10)
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={tplCes} onChange={(e) => setTplCes(e.target.checked)} />
                  Inclure score CES (1-7)
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Questions personnalisées</span>
                  <button
                    type="button"
                    onClick={() =>
                      setTplQuestions((prev) => [
                        ...prev,
                        { id: `q-${Date.now()}`, label: '', type: 'RATING_5', required: false },
                      ])
                    }
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    + Ajouter une question
                  </button>
                </div>
                {tplQuestions.map((q, idx) => (
                  <div key={q.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <input
                      value={q.label}
                      onChange={(e) =>
                        setTplQuestions((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                        )
                      }
                      placeholder="Intitulé de la question..."
                      className="flex-1 min-w-[220px] px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                    />
                    <select
                      value={q.type}
                      onChange={(e) =>
                        setTplQuestions((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, type: e.target.value as SurveyQuestion['type'] } : item
                          )
                        )
                      }
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                    >
                      <option value="RATING_5">Note 1 à 5</option>
                      <option value="YES_NO">Oui / Partiellement / Non</option>
                      <option value="TEXT">Réponse texte libre</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setTplQuestions((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
                >
                  Enregistrer le modèle de sondage
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {previewSurveyToken && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs overflow-y-auto p-4 sm:p-8">
          <div className="max-w-2xl mx-auto">
            <PublicSurveyRunner
              token={previewSurveyToken}
              embedded
              onBack={() => setPreviewSurveyToken(null)}
              onSubmitted={onRefresh}
            />
          </div>
        </div>
      )}
    </div>
  );
}
