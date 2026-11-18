import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Download,
  Upload,
  Sparkles,
  GitMerge,
  Paperclip,
  Send,
  Lock,
  CheckCircle2,
  BookOpen,
  UserCheck,
  ClipboardList,
  Copy,
  ExternalLink,
} from 'lucide-react';
import {
  CHANNEL_LABELS,
  PRIORITY_LABELS,
  ROOT_CAUSES,
  SAV_SERVICE_TYPES,
  STATUS_LABELS,
  Ticket,
  TicketChannel,
  TicketPriority,
  WorkspaceBootstrap,
  computeSlaCountdown,
  formatCurrencyEUR,
} from '../../types/workspace';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/apiClient';
import { PublicSurveyRunner } from '../PublicSurveyRunner';

export function TicketsView({
  data,
  selectedTicketId,
  onSelectTicket,
  onRefresh,
}: {
  data: WorkspaceBootstrap;
  selectedTicketId: number | null;
  onSelectTicket: (id: number | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const { getToken } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [nowMs, setNowMs] = useState(Date.now());

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number>(0);

  // Create ticket fields
  const [newSubject, setNewSubject] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCustomerId, setNewCustomerId] = useState<number>(data.customers[0]?.id || 0);
  const [newCategory, setNewCategory] = useState<string>(data.categories[0]?.name || 'Certification');
  const [newSubcategory, setNewSubcategory] = useState<string>(
    data.categories[0]?.subcategories[0] || 'Délivrance certificat / attestation'
  );
  const [newRequestType, setNewRequestType] = useState<string>(SAV_SERVICE_TYPES[0]);
  const [newChannel, setNewChannel] = useState<TicketChannel>('WEB_FORM');
  const [newPriority, setNewPriority] = useState<TicketPriority>('NORMALE');
  const [newAssignedId, setNewAssignedId] = useState<string>('');

  // Quick Survey dispatch on active ticket
  const [ticketSurveyInvite, setTicketSurveyInvite] = useState<{ token: string; url: string } | null>(null);
  const [previewSurveyToken, setPreviewSurveyToken] = useState<string | null>(null);
  const [copiedSurvey, setCopiedSurvey] = useState(false);

  // CSV Import
  const [csvText, setCsvText] = useState(
    'sujet,description,email,nom,categorie,priorite\nRetard livraison lot #42,Colis bloqué en hub depuis 48h,s.valery@groupe-mercure.fr,Sophie Valéry,Livraison,ELEVEE'
  );
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Message composer
  const [replyBody, setReplyBody] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ name: string; size: string; mimeType: string }>
  >([]);
  const [newTagInput, setNewTagInput] = useState('');

  // AI Copilot state
  const [aiAnalysis, setAiAnalysis] = useState<{
    suggestedCategory: string;
    suggestedPriority: string;
    sentiment: string;
    urgencyScore: number;
    slaRiskWarning: boolean;
    suggestedRootCause: string;
    conversationSummary: string;
    recommendedAction: string;
    matchedKbIds: number[];
  } | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ label: string; body: string }>>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Live SLA timer every 30s
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setAiAnalysis(null);
    setAiSuggestions([]);
    setAiError(null);
    setTicketSurveyInvite(null);
    setCopiedSurvey(false);
  }, [selectedTicketId]);

  const customersById = useMemo(
    () => new Map(data.customers.map((c) => [c.id, c])),
    [data.customers]
  );
  const usersById = useMemo(
    () => new Map(data.members.map((m) => [m.userId, m])),
    [data.members]
  );

  const filteredTickets = useMemo(() => {
    const q = search.toLowerCase();
    return data.tickets.filter((t) => {
      const cust = customersById.get(t.customerId);
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
      if (channelFilter !== 'ALL' && t.channel !== channelFilter) return false;
      if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;
      if (q) {
        const hay = `${t.ticketNumber} ${t.subject} ${t.description} ${cust?.fullName || ''} ${
          cust?.companyName || ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.tickets, search, statusFilter, priorityFilter, channelFilter, categoryFilter, customersById]);

  const activeTicket: Ticket | undefined =
    data.tickets.find((t) => t.id === selectedTicketId) || filteredTickets[0];

  const activeCustomer = activeTicket ? customersById.get(activeTicket.customerId) : undefined;
  const activeMessages = useMemo(
    () => (activeTicket ? data.messages.filter((m) => m.ticketId === activeTicket.id) : []),
    [data.messages, activeTicket]
  );

  const activeCustomerTickets = useMemo(
    () =>
      activeCustomer
        ? data.tickets.filter((t) => t.customerId === activeCustomer.id && t.id !== activeTicket?.id)
        : [],
    [data.tickets, activeCustomer, activeTicket]
  );

  const activeCustomerCsat = useMemo(() => {
    if (!activeCustomer) return '—';
    const list = data.surveys.filter((s) => s.customerId === activeCustomer.id);
    if (!list.length) return '—';
    return (list.reduce((a, s) => a + s.csatScore, 0) / list.length).toFixed(1);
  }, [data.surveys, activeCustomer]);

  const isReadOnly = data.currentUser.activeRole === 'ANALYST';

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;
    const created = await apiRequest<Ticket>('/api/tickets', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: {
        subject: newSubject,
        description: newDesc,
        customerId: newCustomerId || data.customers[0]?.id,
        category: newCategory,
        subcategory: newSubcategory,
        requestType: newRequestType,
        channel: newChannel,
        priority: newPriority,
        assignedUserId: newAssignedId ? Number(newAssignedId) : null,
      },
    });
    setShowCreate(false);
    setNewSubject('');
    setNewDesc('');
    await onRefresh();
    onSelectTicket(created.id);
  };

  const handleDispatchTicketSurvey = async () => {
    if (!activeTicket || isReadOnly) return;
    const token = await getToken();
    if (!token) return;
    const matchingTpl =
      data.surveyTemplates.find(
        (t) => t.isActive && t.targetCategory.toLowerCase() === activeTicket.category.toLowerCase()
      ) ||
      data.surveyTemplates.find((t) => t.isActive && t.targetCategory === 'ALL') ||
      data.surveyTemplates[0];
    if (!matchingTpl) return;

    const res = await apiRequest<{ token: string; surveyUrlPath: string }>('/api/survey-invitations', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: {
        templateId: matchingTpl.id,
        customerId: activeTicket.customerId,
        ticketId: activeTicket.id,
        channel: 'EMAIL',
      },
    });
    const fullUrl = `${window.location.origin}${res.surveyUrlPath}`;
    setTicketSurveyInvite({ token: res.token, url: fullUrl });
    setCopiedSurvey(false);
    await onRefresh();
  };

  const handlePatchTicket = async (patch: Record<string, unknown>) => {
    if (!activeTicket || isReadOnly) return;
    const token = await getToken();
    if (!token) return;
    await apiRequest(`/api/tickets/${activeTicket.id}`, {
      method: 'PATCH',
      token,
      orgId: data.activeOrganization.id,
      body: patch,
    });
    await onRefresh();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyBody.trim() || isReadOnly) return;
    const token = await getToken();
    if (!token) return;
    await apiRequest(`/api/tickets/${activeTicket.id}/messages`, {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: {
        body: replyBody,
        isInternalNote,
        attachments: pendingAttachments,
      },
    });
    setReplyBody('');
    setPendingAttachments([]);
    await onRefresh();
  };

  const handleMerge = async () => {
    if (!activeTicket || !mergeTargetId) return;
    const token = await getToken();
    if (!token) return;
    await apiRequest(`/api/tickets/${activeTicket.id}/merge`, {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: { targetTicketId: mergeTargetId },
    });
    setShowMerge(false);
    await onRefresh();
    onSelectTicket(mergeTargetId);
  };

  const handleImportCsv = async () => {
    const token = await getToken();
    if (!token) return;
    const lines = csvText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const rows = lines.slice(1).map((line) => {
      const [subject, description, customerEmail, customerName, category, priority] = line
        .split(',')
        .map((s) => s?.trim() || '');
      return { subject, description, customerEmail, customerName, category, priority };
    });
    const res = await apiRequest<{ importedCount: number }>('/api/tickets/import-csv', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: { rows },
    });
    setImportStatus(`${res.importedCount} ticket(s) importé(s).`);
    await onRefresh();
  };

  const handleExportCsv = () => {
    const headers = ['Numéro', 'Sujet', 'Client', 'Catégorie', 'Canal', 'Priorité', 'Statut', 'Cause racine', 'Créé le'];
    const rows = filteredTickets.map((t) => {
      const c = customersById.get(t.customerId);
      return [
        t.ticketNumber,
        `"${t.subject.replace(/"/g, '""')}"`,
        `"${(c?.fullName || '').replace(/"/g, '""')}"`,
        t.category,
        CHANNEL_LABELS[t.channel],
        t.priority,
        STATUS_LABELS[t.status],
        t.rootCause,
        new Date(t.createdAt).toISOString(),
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets_${data.activeOrganization.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAiAnalyze = async () => {
    if (!activeTicket) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Session expirée');
      const res = await apiRequest<typeof aiAnalysis>('/api/ai/analyze-ticket', {
        method: 'POST',
        token,
        orgId: data.activeOrganization.id,
        body: { ticketId: activeTicket.id },
      });
      setAiAnalysis(res);
      await onRefresh();
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiSuggestReply = async (refineDraft = false) => {
    if (!activeTicket) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Session expirée');
      const res = await apiRequest<{
        refinedDraft: string;
        suggestions: Array<{ label: string; body: string }>;
      }>('/api/ai/suggest-reply', {
        method: 'POST',
        token,
        orgId: data.activeOrganization.id,
        body: {
          ticketId: activeTicket.id,
          draftToRefine: refineDraft ? replyBody : undefined,
          tone: 'empathique, professionnel et orienté solution',
        },
      });
      if (refineDraft && res.refinedDraft) {
        setReplyBody(res.refinedDraft);
      } else {
        setAiSuggestions(res.suggestions || []);
      }
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const added = files.map((f) => ({
      name: f.name,
      size: `${Math.max(1, Math.round(f.size / 1024))} KB`,
      mimeType: f.type || 'application/octet-stream',
    }));
    setPendingAttachments((prev) => [...prev, ...added]);
  };

  return (
    <div className="space-y-4">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Tickets & Réclamations Omnicanal</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {filteredTickets.length} dossier(s) affichés · SLA temps réel & Copilote Gemini AI
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          {!isReadOnly && (
            <>
              <button
                onClick={() => {
                  setShowImport(!showImport);
                  setImportStatus(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                Import CSV
              </button>
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Nouveau ticket
              </button>
            </>
          )}
        </div>
      </div>

      {/* Create Ticket Drawer */}
      {showCreate && (
        <form
          onSubmit={handleCreateTicket}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <h2 className="font-display text-sm font-semibold">Créer un ticket ou saisir une réclamation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Client *</label>
              <select
                value={newCustomerId}
                onChange={(e) => setNewCustomerId(Number(e.target.value))}
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
              <label className="block text-slate-500 mb-1">Catégorie / Domaine SAV</label>
              <select
                value={newCategory}
                onChange={(e) => {
                  setNewCategory(e.target.value);
                  const found = data.categories.find((c) => c.name === e.target.value);
                  setNewSubcategory(found?.subcategories[0] || 'Général');
                }}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                {data.categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Sous-domaine / Sous-catégorie</label>
              <select
                value={newSubcategory}
                onChange={(e) => setNewSubcategory(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                {(
                  data.categories.find((c) => c.name === newCategory)?.subcategories || ['Général']
                ).map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Type de service SAV</label>
              <select
                value={newRequestType}
                onChange={(e) => setNewRequestType(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                {SAV_SERVICE_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {rt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Canal d’origine</label>
              <select
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value as TicketChannel)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Priorité</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <input
              required
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Sujet du ticket *"
              className="md:col-span-2 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <select
              value={newAssignedId}
              onChange={(e) => setNewAssignedId(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <option value="">Attribution automatique / Non assigné</option>
              {data.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  Assigner à : {m.fullName}
                </option>
              ))}
            </select>
          </div>
          <textarea
            required
            rows={3}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description détaillée de l’incident ou de la réclamation..."
            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
            >
              Créer le ticket
            </button>
          </div>
        </form>
      )}

      {/* CSV Import Panel */}
      {showImport && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Import en masse CSV / Excel</h2>
            {importStatus && <span className="text-xs font-medium text-emerald-600">{importStatus}</span>}
          </div>
          <textarea
            rows={4}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowImport(false)}
              className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
            >
              Fermer
            </button>
            <button
              onClick={handleImportCsv}
              className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
            >
              Importer les lignes
            </button>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par n°, sujet, client..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
        >
          <option value="ALL">Tous statuts</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
        >
          <option value="ALL">Toutes priorités</option>
          {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
        >
          <option value="ALL">Tous canaux</option>
          {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
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
      </div>

      {/* Split Workspace: Queue + Ticket Detail + Customer/AI Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Ticket Queue */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[760px] overflow-y-auto">
            {filteredTickets.map((t) => {
              const cust = customersById.get(t.customerId);
              const sla = computeSlaCountdown(t, nowMs);
              const isSelected = activeTicket?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectTicket(t.id)}
                  className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums font-medium">
                      {t.ticketNumber} · {PRIORITY_LABELS[t.priority]}
                    </span>
                    <span
                      className={`font-mono tabular-nums font-medium ${
                        sla.state === 'breached'
                          ? 'text-red-600 dark:text-red-400'
                          : sla.state === 'warning'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {sla.label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-1 mt-1">
                    {t.subject}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                    {cust?.fullName} · {STATUS_LABELS[t.status]} · {CHANNEL_LABELS[t.channel]}
                  </p>
                </button>
              );
            })}
            {filteredTickets.length === 0 && (
              <p className="p-8 text-center text-xs text-slate-500">Aucun ticket ne correspond aux filtres.</p>
            )}
          </div>
        </div>

        {/* Active Ticket Thread & Controls */}
        {activeTicket ? (
          <div className="lg:col-span-8 space-y-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {activeTicket.ticketNumber}
                    </span>
                    <span>·</span>
                    <span>{CHANNEL_LABELS[activeTicket.channel]}</span>
                    <span>·</span>
                    <span>{activeTicket.category} / {activeTicket.subcategory}</span>
                    <span>·</span>
                    <span>{activeTicket.requestType}</span>
                    <span>·</span>
                    <span>Sentiment IA : {activeTicket.aiSentiment}</span>
                  </div>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {activeTicket.subject}
                  </h2>
                </div>

                {!isReadOnly && (
                  <div className="flex flex-wrap items-center gap-2">
                    {activeTicket.status !== 'RESOLU' && activeTicket.status !== 'CLOTURE' ? (
                      <button
                        onClick={() => handlePatchTicket({ status: 'RESOLU' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Résoudre
                      </button>
                    ) : (
                      <>
                        {activeTicket.status === 'RESOLU' && (
                          <button
                            onClick={() => handlePatchTicket({ status: 'CLOTURE' })}
                            className="px-3 py-1.5 text-xs font-semibold bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 rounded-lg cursor-pointer whitespace-nowrap"
                          >
                            Clôturer
                          </button>
                        )}
                        <button
                          onClick={() => handlePatchTicket({ status: 'REOUVERT' })}
                          className="px-3 py-1.5 text-xs font-medium border border-amber-500 text-amber-700 dark:text-amber-400 rounded-lg cursor-pointer whitespace-nowrap"
                        >
                          Réouvrir
                        </button>
                      </>
                    )}
                    <button
                      onClick={handleDispatchTicketSurvey}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/50 cursor-pointer whitespace-nowrap"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Envoyer un sondage
                    </button>
                    <button
                      onClick={() => {
                        setShowMerge(!showMerge);
                        const alt = data.tickets.find((x) => x.id !== activeTicket.id);
                        if (alt) setMergeTargetId(alt.id);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      Fusionner
                    </button>
                  </div>
                )}
              </div>

              {ticketSurveyInvite && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                      Sondage client généré pour {activeCustomer?.fullName || 'le client'}
                    </p>
                    <p className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300 truncate">
                      {ticketSurveyInvite.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(ticketSurveyInvite.url);
                        setCopiedSurvey(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 font-medium bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-md cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedSurvey ? 'Copié' : 'Copier le lien'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewSurveyToken(ticketSurveyInvite.token)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold bg-emerald-600 text-white rounded-md cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Tester côté client
                    </button>
                  </div>
                </div>
              )}

              {showMerge && (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-wrap items-center gap-3 text-xs">
                  <span className="font-medium">Fusionner ce doublon dans :</span>
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(Number(e.target.value))}
                    className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    {data.tickets
                      .filter((x) => x.id !== activeTicket.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.ticketNumber} — {x.subject}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={handleMerge}
                    className="px-3 py-1.5 font-semibold bg-blue-600 text-white rounded-md cursor-pointer"
                  >
                    Confirmer la fusion
                  </button>
                </div>
              )}

              {/* Metadata Controls Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1">Statut</label>
                  <select
                    disabled={isReadOnly}
                    value={activeTicket.status}
                    onChange={(e) => handlePatchTicket({ status: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1">Priorité</label>
                  <select
                    disabled={isReadOnly}
                    value={activeTicket.priority}
                    onChange={(e) => handlePatchTicket({ priority: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1">Agent assigné</label>
                  <select
                    disabled={isReadOnly}
                    value={activeTicket.assignedUserId || ''}
                    onChange={(e) =>
                      handlePatchTicket({
                        assignedUserId: e.target.value ? Number(e.target.value) : null,
                        status:
                          e.target.value && activeTicket.status === 'NOUVEAU'
                            ? 'ASSIGNE'
                            : activeTicket.status,
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    <option value="">Non assigné</option>
                    {data.members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1">Cause racine</label>
                  <select
                    disabled={isReadOnly}
                    value={activeTicket.rootCause}
                    onChange={(e) => handlePatchTicket({ rootCause: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    {ROOT_CAUSES.map((rc) => (
                      <option key={rc} value={rc}>
                        {rc}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1">Catégorie SAV</label>
                  <select
                    disabled={isReadOnly}
                    value={activeTicket.category}
                    onChange={(e) => {
                      const cat = data.categories.find((c) => c.name === e.target.value);
                      handlePatchTicket({
                        category: e.target.value,
                        subcategory: cat?.subcategories[0] || 'Général',
                      });
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 mb-1">Sous-domaine</label>
                  <select
                    disabled={isReadOnly}
                    value={activeTicket.subcategory}
                    onChange={(e) => handlePatchTicket({ subcategory: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    {(
                      data.categories.find((c) => c.name === activeTicket.category)?.subcategories || [
                        activeTicket.subcategory || 'Général',
                      ]
                    ).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-500 dark:text-slate-400 mb-1">Type de service SAV</label>
                  <select
                    disabled={isReadOnly}
                    value={activeTicket.requestType}
                    onChange={(e) => handlePatchTicket({ requestType: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    {SAV_SERVICE_TYPES.map((rt) => (
                      <option key={rt} value={rt}>
                        {rt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tags + Solution */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Tags :</span>
                  <span>{activeTicket.tags.length ? activeTicket.tags.join(' · ') : 'Aucun'}</span>
                  {!isReadOnly && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!newTagInput.trim()) return;
                        handlePatchTicket({ tags: [...activeTicket.tags, newTagInput.trim()] });
                        setNewTagInput('');
                      }}
                      className="inline-flex items-center gap-1"
                    >
                      <input
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        placeholder="+ tag"
                        className="w-20 px-2 py-0.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </form>
                  )}
                </div>
                <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                  SLA : {computeSlaCountdown(activeTicket, nowMs).label}
                </span>
              </div>
            </div>

            {/* Gemini AI Copilot Panel */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-display text-sm font-semibold">Copilote IA Gemini</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    · Urgence {activeTicket.aiUrgencyScore}/100 · Validation humaine requise
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAiAnalyze}
                    disabled={aiLoading}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    {aiLoading ? 'Analyse...' : 'Analyser & Classifier'}
                  </button>
                  <button
                    onClick={() => handleAiSuggestReply(false)}
                    disabled={aiLoading}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    Suggérer réponses
                  </button>
                </div>
              </div>

              {aiError && <p className="text-xs text-red-600 dark:text-red-400">{aiError}</p>}

              {activeTicket.aiSummary && !aiAnalysis && (
                <p className="text-xs text-slate-600 dark:text-slate-400">{activeTicket.aiSummary}</p>
              )}

              {aiAnalysis && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs">
                  <p className="text-slate-800 dark:text-slate-200">{aiAnalysis.conversationSummary}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
                    <span>
                      Suggestion : <strong>{aiAnalysis.suggestedCategory}</strong> · Priorité{' '}
                      <strong>{aiAnalysis.suggestedPriority}</strong> · Cause{' '}
                      <strong>{aiAnalysis.suggestedRootCause}</strong>
                    </span>
                    {!isReadOnly && (
                      <button
                        onClick={() =>
                          handlePatchTicket({
                            category: aiAnalysis.suggestedCategory,
                            priority: aiAnalysis.suggestedPriority,
                            rootCause: aiAnalysis.suggestedRootCause,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 font-semibold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Valider et appliquer
                      </button>
                    )}
                  </div>
                  <p className="text-slate-500 dark:text-slate-400">
                    Action recommandée : {aiAnalysis.recommendedAction}
                  </p>
                  {aiAnalysis.matchedKbIds.length > 0 && (
                    <div className="space-y-1">
                      <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        Articles KB suggérés :
                      </span>
                      {data.kbArticles
                        .filter((k) => aiAnalysis.matchedKbIds.includes(k.id))
                        .map((k) => (
                          <div
                            key={k.id}
                            className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md flex items-center justify-between gap-2"
                          >
                            <span className="font-medium">{k.title}</span>
                            <button
                              onClick={() => setReplyBody((prev) => `${prev ? prev + '\n\n' : ''}${k.content}`)}
                              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
                            >
                              Insérer
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {aiSuggestions.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {aiSuggestions.map((s, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{s.label}</span>
                        <button
                          onClick={() => setReplyBody(s.body)}
                          className="text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer"
                        >
                          Utiliser ce brouillon
                        </button>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 line-clamp-4 whitespace-pre-wrap">
                        {s.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Conversation + Automatic Customer Context */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="font-display text-sm font-semibold">Historique des échanges & notes</h3>
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {activeMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                        m.isInternalNote
                          ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900'
                          : m.authorType === 'CUSTOMER'
                          ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                          : 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900'
                      }`}
                    >
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5">
                          {m.isInternalNote && <Lock className="w-3 h-3 text-amber-600" />}
                          {m.authorName}
                          {m.isInternalNote ? ' · Note interne' : ''}
                        </span>
                        <span className="font-mono tabular-nums">
                          {new Date(m.createdAt).toLocaleString('fr-FR')}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{m.body}</p>
                      {m.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {m.attachments.map((att, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 font-mono">
                              <Paperclip className="w-3 h-3" />
                              {att.name} ({att.size})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {!isReadOnly && (
                  <form onSubmit={handleSendMessage} className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setIsInternalNote(false)}
                          className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                            !isInternalNote
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                              : 'text-slate-500'
                          }`}
                        >
                          Réponse client
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsInternalNote(true)}
                          className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                            isInternalNote
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200'
                              : 'text-slate-500'
                          }`}
                        >
                          Note interne
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {replyBody.trim() && (
                          <button
                            type="button"
                            onClick={() => handleAiSuggestReply(true)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Reformuler avec IA
                          </button>
                        )}
                        <label className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer">
                          <Paperclip className="w-3.5 h-3.5" />
                          Joindre
                          <input type="file" multiple className="hidden" onChange={handleFileAttach} />
                        </label>
                      </div>
                    </div>

                    {pendingAttachments.length > 0 && (
                      <div className="text-xs text-slate-500 flex flex-wrap gap-2">
                        {pendingAttachments.map((a, i) => (
                          <span key={i} className="font-mono">
                            {a.name} ({a.size})
                          </span>
                        ))}
                      </div>
                    )}

                    <textarea
                      rows={3}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder={
                        isInternalNote
                          ? 'Saisir une note interne visible uniquement par les équipes...'
                          : 'Rédiger votre réponse au client...'
                      }
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={!replyBody.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {isInternalNote ? 'Enregistrer la note' : 'Envoyer au client'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Automatic Customer Context Card */}
              <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="font-display text-sm font-semibold">Contexte Client</h3>
                {activeCustomer ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <p className="font-semibold text-sm text-slate-900 dark:text-white">
                        {activeCustomer.fullName}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {activeCustomer.companyName} · {activeCustomer.customerType}
                      </p>
                      <p className="font-mono text-slate-500 dark:text-slate-400 mt-1">{activeCustomer.email}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 font-mono tabular-nums">
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">CA Client</p>
                        <p className="font-semibold">{formatCurrencyEUR(activeCustomer.totalSpentCents)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">CSAT moy.</p>
                        <p className="font-semibold">{activeCustomerCsat} / 5</p>
                      </div>
                    </div>

                    {activeCustomer.internalNotes && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Note compte</p>
                        <p className="text-slate-600 dark:text-slate-400">{activeCustomer.internalNotes}</p>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <p className="font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Autres tickets ({activeCustomerTickets.length})
                      </p>
                      <div className="space-y-1.5">
                        {activeCustomerTickets.slice(0, 4).map((ot) => (
                          <button
                            key={ot.id}
                            onClick={() => onSelectTicket(ot.id)}
                            className="w-full text-left p-2 rounded-md bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <p className="font-mono text-[11px] text-slate-500">
                              {ot.ticketNumber} · {STATUS_LABELS[ot.status]}
                            </p>
                            <p className="truncate font-medium">{ot.subject}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Client inconnu</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-sm text-slate-500">
            Sélectionnez un ticket ou créez-en un nouveau.
          </div>
        )}
      </div>

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
