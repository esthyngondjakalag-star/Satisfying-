import React, { useMemo, useState } from 'react';
import { Plus, Clock } from 'lucide-react';
import { PRIORITY_LABELS, TicketPriority, WorkspaceBootstrap } from '../../types/workspace';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/apiClient';

export function TeamsSlaView({
  data,
  onRefresh,
}: {
  data: WorkspaceBootstrap;
  onRefresh: () => Promise<void>;
}) {
  const { getToken } = useAuth();
  const [showSlaForm, setShowSlaForm] = useState(false);
  const [slaName, setSlaName] = useState('');
  const [slaPriority, setSlaPriority] = useState<TicketPriority>('ELEVEE');
  const [firstRespMin, setFirstRespMin] = useState(45);
  const [resMin, setResMin] = useState(360);
  const [businessOnly, setBusinessOnly] = useState(true);

  const [workStart, setWorkStart] = useState(data.activeOrganization.workingHours?.start || '08:30');
  const [workEnd, setWorkEnd] = useState(data.activeOrganization.workingHours?.end || '18:30');
  const [savedHoursMsg, setSavedHoursMsg] = useState<string | null>(null);

  const canManage = ['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN'].includes(data.currentUser.activeRole);

  const agentStats = useMemo(() => {
    return data.members.map((m) => {
      const assigned = data.tickets.filter((t) => t.assignedUserId === m.userId);
      const resolved = assigned.filter((t) => t.status === 'RESOLU' || t.status === 'CLOTURE');
      const activeOpen = assigned.filter((t) => t.status !== 'RESOLU' && t.status !== 'CLOTURE');
      const overdue = assigned.filter((t) => t.slaBreached);
      const reopened = assigned.filter((t) => t.reopenCount > 0).length;

      const respMins = assigned
        .filter((t) => t.firstResponseAt)
        .map((t) => (new Date(t.firstResponseAt!).getTime() - new Date(t.createdAt).getTime()) / 60000);
      const avgResp = respMins.length
        ? `${Math.round(respMins.reduce((a, b) => a + b, 0) / respMins.length)}m`
        : '—';

      const resHours = resolved
        .filter((t) => t.resolvedAt)
        .map((t) => (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3600000);
      const avgRes = resHours.length
        ? `${(resHours.reduce((a, b) => a + b, 0) / resHours.length).toFixed(1)}h`
        : '—';

      const fcr = resolved.length
        ? Math.round((resolved.filter((t) => t.reopenCount === 0).length / resolved.length) * 100)
        : 100;
      const reopenRate = assigned.length ? Math.round((reopened / assigned.length) * 100) : 0;
      const slaCompliance = assigned.length
        ? Math.round(((assigned.length - overdue.length) / assigned.length) * 100)
        : 100;

      const relSurveys = data.surveys.filter((s) => s.agentUserId === m.userId);
      const csat = relSurveys.length
        ? (relSurveys.reduce((a, s) => a + s.csatScore, 0) / relSurveys.length).toFixed(1)
        : '—';

      const loadPct = Math.min(100, Math.round((activeOpen.length / Math.max(1, m.maxLoad)) * 100));

      return {
        member: m,
        handled: assigned.length,
        resolvedCount: resolved.length,
        overdueCount: overdue.length,
        avgResp,
        avgRes,
        fcr,
        reopenRate,
        slaCompliance,
        csat,
        activeCount: activeOpen.length,
        loadPct,
      };
    });
  }, [data.members, data.tickets, data.surveys]);

  const handleCreateSla = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;
    await apiRequest('/api/sla-policies', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: {
        name: slaName,
        priority: slaPriority,
        firstResponseMinutes: firstRespMin,
        resolutionMinutes: resMin,
        businessHoursOnly: businessOnly,
      },
    });
    setShowSlaForm(false);
    setSlaName('');
    await onRefresh();
  };

  const handleToggleSla = async (id: number, isActive: boolean) => {
    const token = await getToken();
    if (!token) return;
    await apiRequest(`/api/sla-policies/${id}`, {
      method: 'PATCH',
      token,
      orgId: data.activeOrganization.id,
      body: { isActive: !isActive },
    });
    await onRefresh();
  };

  const handleSaveHours = async () => {
    const token = await getToken();
    if (!token) return;
    await apiRequest('/api/organization', {
      method: 'PATCH',
      token,
      orgId: data.activeOrganization.id,
      body: {
        workingHours: {
          start: workStart,
          end: workEnd,
          days: data.activeOrganization.workingHours?.days || ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'],
        },
      },
    });
    setSavedHoursMsg('Horaires SLA enregistrés.');
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold">Performance Équipes & Engagements SLA</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Indicateurs équilibrés entre réactivité, qualité de résolution (FCR, réouvertures, CSAT) et charge de travail
        </p>
      </div>

      {/* Agent Performance Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">Tableau de performance des agents</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {data.teams.length} équipes actives
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-left">
                <th className="py-3 px-4 font-medium">Collaborateur</th>
                <th className="py-3 px-3 font-medium text-right">Traités</th>
                <th className="py-3 px-3 font-medium text-right">Résolus</th>
                <th className="py-3 px-3 font-medium text-right">Retards</th>
                <th className="py-3 px-3 font-medium text-right">1ère rép.</th>
                <th className="py-3 px-3 font-medium text-right">Résol. moy.</th>
                <th className="py-3 px-3 font-medium text-right">FCR</th>
                <th className="py-3 px-3 font-medium text-right">Réouv.</th>
                <th className="py-3 px-3 font-medium text-right">CSAT</th>
                <th className="py-3 px-3 font-medium text-right">SLA %</th>
                <th className="py-3 px-4 font-medium">Charge actuelle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {agentStats.map((row) => (
                <tr key={row.member.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      {row.member.avatarUrl ? (
                        <img
                          src={row.member.avatarUrl}
                          alt={row.member.fullName}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-semibold text-[10px] shrink-0">
                          {row.member.fullName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{row.member.fullName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{row.member.jobTitle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{row.handled}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{row.resolvedCount}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                    {row.overdueCount}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{row.avgResp}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{row.avgRes}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{row.fcr}%</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{row.reopenRate}%</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">{row.csat}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                    {row.slaCompliance}%
                  </td>
                  <td className="py-3 px-4 min-w-[130px]">
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums mb-1">
                      <span>
                        {row.activeCount}/{row.member.maxLoad}
                      </span>
                      <span>{row.loadPct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${row.loadPct}%` }}
                        className={`h-full rounded-full ${
                          row.loadPct > 85 ? 'bg-red-600' : row.loadPct > 65 ? 'bg-amber-500' : 'bg-blue-600'
                        }`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SLA Policies & Working Hours */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Politiques SLA & Délais contractuels</h2>
            {canManage && (
              <button
                onClick={() => setShowSlaForm(!showSlaForm)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter une règle SLA
              </button>
            )}
          </div>

          {showSlaForm && (
            <form
              onSubmit={handleCreateSla}
              className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs items-end"
            >
              <div className="sm:col-span-2">
                <label className="block text-slate-500 mb-1">Nom de la politique *</label>
                <input
                  required
                  value={slaName}
                  onChange={(e) => setSlaName(e.target.value)}
                  placeholder="Ex. SLA VIP Livraison"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Priorité</label>
                <select
                  value={slaPriority}
                  onChange={(e) => setSlaPriority(e.target.value as TicketPriority)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">1ère rép. (min)</label>
                <input
                  type="number"
                  value={firstRespMin}
                  onChange={(e) => setFirstRespMin(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Résol. (min)</label>
                <input
                  type="number"
                  value={resMin}
                  onChange={(e) => setResMin(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                />
              </div>
              <div className="sm:col-span-5 flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={businessOnly}
                    onChange={(e) => setBusinessOnly(e.target.checked)}
                  />
                  Décompter uniquement pendant les heures ouvrables
                </label>
                <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-md cursor-pointer">
                  Enregistrer SLA
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.slaPolicies.map((p) => (
              <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{p.name}</p>
                  <p className="text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                    Priorité {PRIORITY_LABELS[p.priority]} · 1ère réponse {p.firstResponseMinutes} min · Résolution{' '}
                    {Math.round(p.resolutionMinutes / 60)} h ·{' '}
                    {p.businessHoursOnly ? 'Heures ouvrées' : '24/7'}
                  </p>
                </div>
                {canManage && (
                  <button
                    onClick={() => handleToggleSla(p.id, p.isActive)}
                    className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                      p.isActive
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    {p.isActive ? 'Actif' : 'Inactif'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Business Hours & Holidays */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit">
          <h2 className="font-display text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            Horaires ouvrables & Jours fériés
          </h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Ouverture</label>
              <input
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Fermeture</label>
              <input
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
              />
            </div>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">Jours ouvrés</p>
            <p>{(data.activeOrganization.workingHours?.days || []).join(' · ')}</p>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">Jours fériés exclus</p>
            <p className="font-mono tabular-nums">{(data.activeOrganization.holidays || []).join(' · ')}</p>
          </div>
          {savedHoursMsg && <p className="text-xs text-emerald-600">{savedHoursMsg}</p>}
          {canManage && (
            <button
              onClick={handleSaveHours}
              className="w-full py-2 text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg cursor-pointer"
            >
              Enregistrer les horaires
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
