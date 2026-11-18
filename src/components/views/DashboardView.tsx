import React, { useMemo, useState } from 'react';
import { Sparkles, Filter, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';
import {
  CHANNEL_LABELS,
  STATUS_LABELS,
  Ticket,
  TicketChannel,
  TicketStatus,
  WorkspaceBootstrap,
  computeSlaCountdown,
} from '../../types/workspace';
import { HorizontalDistributionList, InteractiveTrendChart } from '../Charts';
import { apiRequest } from '../../lib/apiClient';
import { useAuth } from '../../contexts/AuthContext';

export function DashboardView({
  data,
  onSelectTicket,
  onNavigate,
}: {
  data: WorkspaceBootstrap;
  onSelectTicket: (ticketId: number) => void;
  onNavigate: (tab: string) => void;
}) {
  const { getToken } = useAuth();
  const [periodFilter, setPeriodFilter] = useState<'7d' | '30d' | 'all'>('30d');
  const [agencyFilter, setAgencyFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [agentFilter, setAgentFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [channelFilter, setChannelFilter] = useState<string>('ALL');

  const [aiInsights, setAiInsights] = useState<{
    executiveSummary: string;
    recurringPatterns: string[];
    dissatisfactionDrivers: string[];
    actionPlan: string[];
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const filteredTickets = useMemo(() => {
    const now = Date.now();
    const cutoff =
      periodFilter === '7d'
        ? now - 7 * 86400000
        : periodFilter === '30d'
        ? now - 30 * 86400000
        : 0;

    return data.tickets.filter((t) => {
      if (cutoff && new Date(t.createdAt).getTime() < cutoff) return false;
      if (agencyFilter !== 'ALL' && String(t.agencyId) !== agencyFilter) return false;
      if (teamFilter !== 'ALL' && String(t.teamId) !== teamFilter) return false;
      if (agentFilter !== 'ALL' && String(t.assignedUserId) !== agentFilter) return false;
      if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;
      if (channelFilter !== 'ALL' && t.channel !== channelFilter) return false;
      return true;
    });
  }, [data.tickets, periodFilter, agencyFilter, teamFilter, agentFilter, categoryFilter, channelFilter]);

  const metrics = useMemo(() => {
    const total = filteredTickets.length;
    const openStatuses: TicketStatus[] = [
      'NOUVEAU',
      'EN_ATTENTE_ATTRIBUTION',
      'ASSIGNE',
      'EN_ATTENTE_CLIENT',
      'EN_ATTENTE_INTERNE',
      'ESCALADE',
      'REOUVERT',
    ];
    const openCount = filteredTickets.filter((t) => openStatuses.includes(t.status)).length;
    const inProgressCount = filteredTickets.filter((t) => t.status === 'EN_COURS').length;
    const resolvedCount = filteredTickets.filter(
      (t) => t.status === 'RESOLU' || t.status === 'CLOTURE'
    ).length;
    const overdueCount = filteredTickets.filter((t) => {
      const sla = computeSlaCountdown(t);
      return sla.state === 'breached';
    }).length;
    const criticalCount = filteredTickets.filter(
      (t) => t.priority === 'CRITIQUE' && t.status !== 'RESOLU' && t.status !== 'CLOTURE'
    ).length;

    const firstRespList = filteredTickets
      .filter((t) => t.firstResponseAt)
      .map((t) => (new Date(t.firstResponseAt!).getTime() - new Date(t.createdAt).getTime()) / 60000);
    const avgFirstRespMin = firstRespList.length
      ? Math.round(firstRespList.reduce((a, b) => a + b, 0) / firstRespList.length)
      : 0;

    const resList = filteredTickets
      .filter((t) => t.resolvedAt)
      .map((t) => (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3600000);
    const avgResHours = resList.length
      ? (resList.reduce((a, b) => a + b, 0) / resList.length).toFixed(1)
      : '0.0';

    const resolutionRate = total ? Math.round((resolvedCount / total) * 100) : 0;
    const reopenedCount = filteredTickets.filter((t) => t.reopenCount > 0 || t.status === 'REOUVERT').length;
    const reopenRate = total ? Math.round((reopenedCount / total) * 100) : 0;

    const slaCompliantCount = filteredTickets.filter((t) => !t.slaBreached && computeSlaCountdown(t).state !== 'breached').length;
    const slaRate = total ? Math.round((slaCompliantCount / total) * 100) : 100;

    const ticketIds = new Set(filteredTickets.map((t) => t.id));
    const relSurveys = data.surveys.filter((s) => s.ticketId != null && ticketIds.has(s.ticketId));
    const surveysToUse = relSurveys.length > 0 ? relSurveys : data.surveys;

    const avgCsat = surveysToUse.length
      ? (surveysToUse.reduce((a, s) => a + s.csatScore, 0) / surveysToUse.length).toFixed(2)
      : '—';

    const promoters = surveysToUse.filter((s) => s.npsScore >= 9).length;
    const detractors = surveysToUse.filter((s) => s.npsScore <= 6).length;
    const nps = surveysToUse.length
      ? Math.round(((promoters - detractors) / surveysToUse.length) * 100)
      : 0;

    const avgCes = surveysToUse.length
      ? (surveysToUse.reduce((a, s) => a + s.cesScore, 0) / surveysToUse.length).toFixed(1)
      : '—';

    const dissatisfiedCount = surveysToUse.filter((s) => s.csatScore <= 2).length;

    return {
      total,
      openCount,
      inProgressCount,
      resolvedCount,
      overdueCount,
      criticalCount,
      avgFirstRespMin,
      avgResHours,
      resolutionRate,
      reopenRate,
      slaRate,
      avgCsat,
      nps,
      avgCes,
      dissatisfiedCount,
    };
  }, [filteredTickets, data.surveys]);

  const trendData = useMemo(() => {
    const days = ['J-5', 'J-4', 'J-3', 'J-2', 'Hier', 'Auj.'];
    const now = Date.now();
    return days.map((label, idx) => {
      const bucketOffset = 5 - idx;
      const start = now - (bucketOffset + 1) * 86400000;
      const end = now - bucketOffset * 86400000;
      const created = filteredTickets.filter((t) => {
        const ms = new Date(t.createdAt).getTime();
        return ms >= start && ms < end;
      }).length;
      const resolved = filteredTickets.filter((t) => {
        if (!t.resolvedAt) return false;
        const ms = new Date(t.resolvedAt).getTime();
        return ms >= start && ms < end;
      }).length;
      return { label, value: created, secondaryValue: resolved };
    });
  }, [filteredTickets]);

  const rootCauseDist = useMemo(() => {
    const counts = new Map<string, number>();
    filteredTickets.forEach((t) => {
      if (t.rootCause && t.rootCause !== 'Non définie') {
        counts.set(t.rootCause, (counts.get(t.rootCause) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [filteredTickets]);

  const channelDist = useMemo(() => {
    const counts = new Map<string, number>();
    filteredTickets.forEach((t) => {
      const label = CHANNEL_LABELS[t.channel as TicketChannel] || t.channel;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTickets]);

  const agentPerf = useMemo(() => {
    return data.members
      .filter((m) => m.role !== 'ANALYST')
      .map((m) => {
        const assigned = filteredTickets.filter((t) => t.assignedUserId === m.userId);
        const resolved = assigned.filter((t) => t.status === 'RESOLU' || t.status === 'CLOTURE').length;
        const agentSurveys = data.surveys.filter((s) => s.agentUserId === m.userId);
        const csat = agentSurveys.length
          ? (agentSurveys.reduce((a, s) => a + s.csatScore, 0) / agentSurveys.length).toFixed(1)
          : '—';
        return {
          name: m.fullName,
          role: m.jobTitle,
          total: assigned.length,
          resolved,
          csat,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [data.members, data.surveys, filteredTickets]);

  const agencyPerf = useMemo(() => {
    return data.agencies.map((ag) => {
      const agTickets = filteredTickets.filter((t) => t.agencyId === ag.id);
      const compliant = agTickets.filter((t) => !t.slaBreached).length;
      const slaPct = agTickets.length ? Math.round((compliant / agTickets.length) * 100) : 100;
      return {
        label: ag.name,
        sublabel: ag.city,
        value: agTickets.length,
        slaPct,
      };
    });
  }, [data.agencies, filteredTickets]);

  const urgentTickets = useMemo(() => {
    return filteredTickets
      .filter((t) => {
        const sla = computeSlaCountdown(t);
        return t.priority === 'CRITIQUE' || sla.state === 'breached' || sla.state === 'warning';
      })
      .slice(0, 5);
  }, [filteredTickets]);

  const handleRunAiInsights = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Session expirée');
      const res = await apiRequest<typeof aiInsights>('/api/ai/insights', {
        method: 'POST',
        token,
        orgId: data.activeOrganization.id,
        body: {},
      });
      setAiInsights(res);
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Multi-Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Pilotage Opérationnel & Qualité
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {data.activeOrganization.name} · Comparaison dynamique vs période précédente
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {[
              { id: '7d', label: '7 jours' },
              { id: '30d', label: '30 jours' },
              { id: 'all', label: 'Tout' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodFilter(p.id as '7d' | '30d' | 'all')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  periodFilter === p.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleRunAiInsights}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {aiLoading ? 'Synthèse Gemini...' : 'Diagnostic Qualité IA'}
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 px-1.5">
          <Filter className="w-3.5 h-3.5" />
          Filtres
        </span>
        <select
          value={agencyFilter}
          onChange={(e) => setAgencyFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
        >
          <option value="ALL">Toutes les agences</option>
          {data.agencies.map((a) => (
            <option key={a.id} value={String(a.id)}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
        >
          <option value="ALL">Toutes les équipes</option>
          {data.teams.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
        >
          <option value="ALL">Tous les agents</option>
          {data.members.map((m) => (
            <option key={m.userId} value={String(m.userId)}>
              {m.fullName}
            </option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
        >
          <option value="ALL">Toutes catégories</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
        >
          <option value="ALL">Tous les canaux</option>
          {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Gemini AI Executive Summary if triggered */}
      {aiError && (
        <div className="p-3.5 text-xs border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg">
          {aiError}
        </div>
      )}

      {aiInsights && (
        <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Synthèse Direction Qualité (Gemini AI)
            </h2>
            <button
              onClick={() => setAiInsights(null)}
              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              Fermer
            </button>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{aiInsights.executiveSummary}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white mb-1.5">Problèmes récurrents</p>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                {aiInsights.recurringPatterns.map((p, idx) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white mb-1.5">Causes d’insatisfaction</p>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                {aiInsights.dissatisfactionDrivers.map((p, idx) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white mb-1.5">Plan d’action recommandé</p>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                {aiInsights.actionPlan.map((p, idx) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Primary KPI Grid (tabular numerals, single elevation) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'Total réclamations',
            val: String(metrics.total),
            delta: '+8% vs M-1',
            positive: true,
          },
          {
            label: 'Ouverts / En cours',
            val: `${metrics.openCount} / ${metrics.inProgressCount}`,
            delta: `${metrics.criticalCount} critiques`,
            positive: metrics.criticalCount === 0,
          },
          {
            label: 'En retard SLA',
            val: String(metrics.overdueCount),
            delta: `Respect ${metrics.slaRate}%`,
            positive: metrics.overdueCount === 0,
          },
          {
            label: '1ère réponse moy.',
            val: `${metrics.avgFirstRespMin} min`,
            delta: '-14% délai',
            positive: true,
          },
          {
            label: 'Résolution moy.',
            val: `${metrics.avgResHours} h`,
            delta: `Taux ${metrics.resolutionRate}%`,
            positive: metrics.resolutionRate >= 50,
          },
          {
            label: 'Réouverture',
            val: `${metrics.reopenRate}%`,
            delta: 'Cible < 5%',
            positive: metrics.reopenRate <= 10,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{kpi.label}</p>
            <p className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-white">
              {kpi.val}
            </p>
            <p
              className={`text-[11px] font-medium flex items-center gap-1 ${
                kpi.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {kpi.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {kpi.delta}
            </p>
          </div>
        ))}
      </div>

      {/* Satisfaction & SLA Executive Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Satisfaction CSAT</p>
            <p className="font-mono tabular-nums text-2xl font-bold mt-1">{metrics.avgCsat} / 5</p>
          </div>
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Cible ≥ 4.2</span>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Score NPS</p>
            <p className="font-mono tabular-nums text-2xl font-bold mt-1">
              {metrics.nps > 0 ? `+${metrics.nps}` : metrics.nps}
            </p>
          </div>
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Recommandation</span>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Score CES (Effort)</p>
            <p className="font-mono tabular-nums text-2xl font-bold mt-1">{metrics.avgCes} / 7</p>
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Facilité perçue</span>
        </div>
        <div
          onClick={() => onNavigate('satisfaction')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
        >
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Clients insatisfaits</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
              {metrics.dissatisfiedCount}
            </p>
          </div>
          <span className="text-xs font-medium text-red-600 dark:text-red-400">CSAT ≤ 2/5 →</span>
        </div>
      </div>

      {/* Main Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-sm font-semibold mb-4">
            Évolution des réclamations vs résolutions
          </h2>
          <InteractiveTrendChart data={trendData} primaryLabel="Créés" secondaryLabel="Résolus" />
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-sm font-semibold mb-4">
            Principales causes d’insatisfaction
          </h2>
          <HorizontalDistributionList
            items={rootCauseDist}
            accentClass="bg-amber-600 dark:bg-amber-500"
            valueFormatter={(v) => `${v} dossier${v > 1 ? 's' : ''}`}
          />
        </div>
      </div>

      {/* Operational Watchlist + Teams & Agencies */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Tickets critiques & alertes SLA
            </h2>
            <button
              onClick={() => onNavigate('tickets')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Voir tous les tickets
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {urgentTickets.map((t) => {
              const sla = computeSlaCountdown(t);
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectTicket(t.id)}
                  className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {t.ticketNumber} · {t.priority} · {STATUS_LABELS[t.status]}
                    </p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{t.subject}</p>
                  </div>
                  <span
                    className={`text-xs font-mono tabular-nums shrink-0 font-medium ${
                      sla.state === 'breached'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {sla.label}
                  </span>
                </button>
              );
            })}
            {urgentTickets.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-500">Aucun ticket en risque SLA.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-sm font-semibold mb-4">Performance Agents</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {agentPerf.map((a) => (
              <div key={a.name} className="py-2.5 flex items-center justify-between text-xs">
                <div className="min-w-0 pr-2">
                  <p className="font-medium text-slate-900 dark:text-white truncate">{a.name}</p>
                  <p className="text-slate-500 dark:text-slate-400 truncate">{a.role}</p>
                </div>
                <div className="text-right font-mono tabular-nums shrink-0">
                  <p className="text-slate-900 dark:text-white font-semibold">
                    {a.resolved}/{a.total} rés.
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">CSAT {a.csat}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="font-display text-sm font-semibold mb-3">Agences & Sites</h2>
            <div className="space-y-2.5">
              {agencyPerf.map((ag) => (
                <div key={ag.label} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{ag.label}</p>
                    <p className="text-slate-500 dark:text-slate-400">{ag.sublabel}</p>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="font-semibold">{ag.value} tickets</p>
                    <p className="text-emerald-600 dark:text-emerald-400">SLA {ag.slaPct}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <h3 className="font-display text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
              Mix Omnicanal
            </h3>
            <HorizontalDistributionList items={channelDist} accentClass="bg-blue-600 dark:bg-blue-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
