import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Zap, BookOpen, Search } from 'lucide-react';
import { KbArticle, WorkspaceBootstrap } from '../../types/workspace';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/apiClient';

export function AutomationsKbView({
  data,
  mode,
  onRefresh,
}: {
  data: WorkspaceBootstrap;
  mode: 'automations' | 'kb';
  onRefresh: () => Promise<void>;
}) {
  const { getToken } = useAuth();
  const canEdit = ['ORG_ADMIN', 'CS_MANAGER', 'SUPER_ADMIN'].includes(data.currentUser.activeRole);

  // Automation form state
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleDesc, setRuleDesc] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('TICKET_CREATED');
  const [condField, setCondField] = useState('priority');
  const [condOp, setCondOp] = useState('EQUALS');
  const [condVal, setCondVal] = useState('CRITIQUE');
  const [actType, setActType] = useState('ADD_TAG');
  const [actVal, setActVal] = useState('Prioritaire');

  // KB form & search state
  const [kbSearch, setKbSearch] = useState('');
  const [kbTypeFilter, setKbTypeFilter] = useState('ALL');
  const [showKbForm, setShowKbForm] = useState(false);
  const [kbTitle, setKbTitle] = useState('');
  const [kbCategory, setKbCategory] = useState(data.categories[0]?.name || 'Produit');
  const [kbType, setKbType] = useState<KbArticle['articleType']>('GUIDE');
  const [kbVisibility, setKbVisibility] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC');
  const [kbContent, setKbContent] = useState('');

  const filteredKb = useMemo(() => {
    const q = kbSearch.toLowerCase();
    return data.kbArticles.filter((a) => {
      if (kbTypeFilter !== 'ALL' && a.articleType !== kbTypeFilter) return false;
      if (q && !`${a.title} ${a.content} ${a.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.kbArticles, kbSearch, kbTypeFilter]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;
    await apiRequest('/api/automations', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: {
        name: ruleName,
        description: ruleDesc,
        triggerEvent,
        conditions: [{ field: condField, operator: condOp, value: condVal }],
        actions: [{ type: actType, value: actVal }],
      },
    });
    setShowRuleForm(false);
    setRuleName('');
    setRuleDesc('');
    await onRefresh();
  };

  const handleToggleRule = async (id: number, current: boolean) => {
    const token = await getToken();
    if (!token) return;
    await apiRequest(`/api/automations/${id}`, {
      method: 'PATCH',
      token,
      orgId: data.activeOrganization.id,
      body: { isActive: !current },
    });
    await onRefresh();
  };

  const handleDeleteRule = async (id: number) => {
    const token = await getToken();
    if (!token) return;
    await apiRequest(`/api/automations/${id}`, {
      method: 'DELETE',
      token,
      orgId: data.activeOrganization.id,
    });
    await onRefresh();
  };

  const handleCreateKb = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;
    await apiRequest('/api/kb-articles', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: {
        title: kbTitle,
        category: kbCategory,
        articleType: kbType,
        visibility: kbVisibility,
        content: kbContent,
        isPublished: true,
      },
    });
    setShowKbForm(false);
    setKbTitle('');
    setKbContent('');
    await onRefresh();
  };

  const handleTogglePublishKb = async (id: number, current: boolean) => {
    const token = await getToken();
    if (!token) return;
    await apiRequest(`/api/kb-articles/${id}`, {
      method: 'PATCH',
      token,
      orgId: data.activeOrganization.id,
      body: { isPublished: !current },
    });
    await onRefresh();
  };

  if (mode === 'automations') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold">Moteur de Workflows & Automatisations</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Règles conditionnelles SI → ALORS exécutées automatiquement à la création et mise à jour des tickets
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowRuleForm(!showRuleForm)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Nouvelle règle
            </button>
          )}
        </div>

        {showRuleForm && (
          <form
            onSubmit={handleCreateRule}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
          >
            <h2 className="font-display text-sm font-semibold">Configurer un workflow conditionnel</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                required
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="Nom de la règle *"
                className="px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
              <input
                value={ruleDesc}
                onChange={(e) => setRuleDesc(e.target.value)}
                placeholder="Description opérationnelle"
                className="px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
              <select
                value={triggerEvent}
                onChange={(e) => setTriggerEvent(e.target.value)}
                className="px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value="TICKET_CREATED">Déclencheur : Nouveau ticket</option>
                <option value="TICKET_UPDATED">Déclencheur : Ticket modifié</option>
                <option value="TICKET_RESOLVED">Déclencheur : Ticket résolu</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-2">
                <p className="font-semibold text-slate-700 dark:text-slate-300">SI (Condition)</p>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={condField}
                    onChange={(e) => setCondField(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    <option value="priority">Priorité</option>
                    <option value="category">Catégorie</option>
                    <option value="channel">Canal</option>
                    <option value="status">Statut</option>
                    <option value="keyword">Mot-clé</option>
                    <option value="customerType">Type client</option>
                  </select>
                  <select
                    value={condOp}
                    onChange={(e) => setCondOp(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    <option value="EQUALS">Est égal à</option>
                    <option value="CONTAINS">Contient</option>
                    <option value="IN">Parmi (virgule)</option>
                  </select>
                  <input
                    value={condVal}
                    onChange={(e) => setCondVal(e.target.value)}
                    placeholder="Valeur"
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-slate-700 dark:text-slate-300">ALORS (Action)</p>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={actType}
                    onChange={(e) => setActType(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    <option value="ADD_TAG">Ajouter un tag</option>
                    <option value="SET_PRIORITY">Changer priorité</option>
                    <option value="ASSIGN_TEAM">Assigner une équipe</option>
                    <option value="ESCALATE">Escalader le ticket</option>
                    <option value="CREATE_NOTIFICATION">Notifier responsable</option>
                    <option value="SEND_SURVEY">Envoyer enquête CSAT</option>
                  </select>
                  <input
                    value={actVal}
                    onChange={(e) => setActVal(e.target.value)}
                    placeholder="Paramètre action"
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRuleForm(false)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg cursor-pointer"
              >
                Activer la règle
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.automations.map((rule) => (
            <div
              key={rule.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>{rule.triggerEvent}</span>
                    <span>·</span>
                    <span className="tabular-nums">{rule.executionCount} exécutions</span>
                  </div>
                  <h3 className="font-display text-sm font-semibold mt-1">{rule.name}</h3>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleRule(rule.id, rule.isActive)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                        rule.isActive
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {rule.isActive ? 'Actif' : 'Pause'}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400">{rule.description}</p>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
                <p>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">SI : </span>
                  {rule.conditions.map((c) => `${c.field} ${c.operator} "${c.value}"`).join(' ET ')}
                </p>
                <p>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">ALORS : </span>
                  {rule.actions.map((a) => `${a.type} (${a.value})`).join(' · ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Knowledge Base Mode
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Base de Connaissances & Scripts SAV</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            FAQ publiques, procédures internes, guides de résolution et scripts suggérés par l’IA
          </p>
        </div>
        {data.currentUser.activeRole !== 'ANALYST' && (
          <button
            onClick={() => setShowKbForm(!showKbForm)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Nouvel article
          </button>
        )}
      </div>

      {showKbForm && (
        <form
          onSubmit={handleCreateKb}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
        >
          <h2 className="font-display text-sm font-semibold">Rédiger un article ou script</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              required
              value={kbTitle}
              onChange={(e) => setKbTitle(e.target.value)}
              placeholder="Titre de l’article *"
              className="md:col-span-2 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <select
              value={kbCategory}
              onChange={(e) => setKbCategory(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              {data.categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={kbType}
                onChange={(e) => setKbType(e.target.value as any)}
                className="px-2 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value="GUIDE">Guide</option>
                <option value="FAQ">FAQ</option>
                <option value="PROCEDURE">Procédure</option>
                <option value="SCRIPT">Script</option>
                <option value="SOLUTION">Solution</option>
              </select>
              <select
                value={kbVisibility}
                onChange={(e) => setKbVisibility(e.target.value as any)}
                className="px-2 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value="PUBLIC">Public</option>
                <option value="INTERNAL">Interne</option>
              </select>
            </div>
          </div>
          <textarea
            required
            rows={4}
            value={kbContent}
            onChange={(e) => setKbContent(e.target.value)}
            placeholder="Contenu détaillé de la procédure ou réponse type..."
            className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowKbForm(false)}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg cursor-pointer"
            >
              Publier l’article
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            value={kbSearch}
            onChange={(e) => setKbSearch(e.target.value)}
            placeholder="Rechercher une procédure, un script, une FAQ..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
        </div>
        <select
          value={kbTypeFilter}
          onChange={(e) => setKbTypeFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
        >
          <option value="ALL">Tous types</option>
          <option value="FAQ">FAQ</option>
          <option value="GUIDE">Guides</option>
          <option value="PROCEDURE">Procédures</option>
          <option value="SCRIPT">Scripts</option>
          <option value="SOLUTION">Solutions</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredKb.map((art) => (
          <article
            key={art.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                {art.category} · {art.articleType} · {art.visibility === 'PUBLIC' ? 'Public (Portail)' : 'Interne'}
              </span>
              {canEdit && (
                <button
                  onClick={() => handleTogglePublishKb(art.id, art.isPublished)}
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {art.isPublished ? 'Publié' : 'Brouillon'}
                </button>
              )}
            </div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">{art.title}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed">
              {art.content}
            </p>
            <p className="text-[11px] font-mono tabular-nums text-slate-400 pt-1">
              Par {art.authorName} · {art.viewsCount} vues · {art.helpfulCount} votes utiles
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
