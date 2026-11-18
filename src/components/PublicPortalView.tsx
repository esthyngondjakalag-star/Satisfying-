import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Search, Send, BookOpen, FileText, Copy, Check } from 'lucide-react';
import { SAV_SERVICE_TYPES, STATUS_LABELS, TicketStatus } from '../types/workspace';

interface PortalData {
  organization: {
    id: number;
    name: string;
    slug: string;
    portalTitle: string;
    primaryColor: string;
  };
  categories: Array<{ id: number; name: string; subcategories: string[]; requestTypes: string[] }>;
  articles: Array<{ id: number; title: string; category: string; articleType: string; content: string }>;
}

export function PublicPortalView({
  orgSlug = 'horizon-distribution-demo',
  onBack,
  embedded = false,
}: {
  orgSlug?: string;
  onBack?: () => void;
  embedded?: boolean;
}) {
  const [portal, setPortal] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'submit' | 'track' | 'faq'>('submit');

  // Submit form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [category, setCategory] = useState('Certification');
  const [subcategory, setSubcategory] = useState('Délivrance certificat / attestation');
  const [requestType, setRequestType] = useState(SAV_SERVICE_TYPES[0]);
  const [priority, setPriority] = useState('NORMALE');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Track form
  const [trackNum, setTrackNum] = useState('CP-2026-0101');
  const [trackEmail, setTrackEmail] = useState('s.valery@groupe-mercure.fr');
  const [tracked, setTracked] = useState<{
    ticket: any;
    customer: any;
    messages: Array<{ id: number; authorType: string; authorName: string; body: string; createdAt: string }>;
  } | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [csat, setCsat] = useState(5);
  const [nps, setNps] = useState(9);
  const [ces, setCes] = useState(6);
  const [surveyComment, setSurveyComment] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/portal/${encodeURIComponent(orgSlug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setPortal(data);
      })
      .finally(() => setLoading(false));
  }, [orgSlug]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(orgSlug)}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          companyName,
          category,
          subcategory,
          requestType,
          priority,
          subject,
          description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSubmitResult(data.ticketNumber);
      setTrackNum(data.ticketNumber);
      setTrackEmail(email);
      setSubject('');
      setDescription('');
    } catch (err: any) {
      setTrackError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrack = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setTrackError(null);
    setFeedbackSuccess(null);
    try {
      const res = await fetch(
        `/api/portal/${encodeURIComponent(orgSlug)}/track?ticketNumber=${encodeURIComponent(
          trackNum
        )}&email=${encodeURIComponent(trackEmail)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Dossier introuvable');
      setTracked(data);
    } catch (err: any) {
      setTracked(null);
      setTrackError(err.message);
    }
  };

  const handleSendReply = async (confirmResolution = false, withSurvey = false) => {
    if (!tracked) return;
    setFeedbackSuccess(null);
    const res = await fetch(`/api/portal/${encodeURIComponent(orgSlug)}/track/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketNumber: tracked.ticket.ticketNumber,
        email: trackEmail,
        body: replyBody,
        confirmResolution,
        ...(withSurvey ? { csatScore: csat, npsScore: nps, cesScore: ces, comment: surveyComment } : {}),
      }),
    });
    if (res.ok) {
      setReplyBody('');
      setFeedbackSuccess(
        withSurvey
          ? 'Merci pour votre évaluation de satisfaction.'
          : confirmResolution
          ? 'Résolution confirmée et dossier clôturé.'
          : 'Votre message a bien été transmis à l’équipe support.'
      );
      await handleTrack();
    }
  };

  if (loading) {
    return (
      <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
        Chargement du portail client...
      </div>
    );
  }

  const accentColor = portal?.organization.primaryColor || '#2563EB';

  return (
    <div className={embedded ? '' : 'min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100'}>
      <div className={embedded ? 'space-y-6' : 'max-w-5xl mx-auto px-6 py-8 space-y-6'}>
        {/* Header Portal */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              style={{ backgroundColor: accentColor }}
              className="w-10 h-10 rounded-lg text-white font-display font-bold flex items-center justify-center text-sm shrink-0"
            >
              {(portal?.organization.name || 'CP').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {portal?.organization.portalTitle || 'Portail Service Client'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {portal?.organization.name} · Déposez une réclamation, suivez votre dossier ou consultez nos guides
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                onClick={() => setTab('submit')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === 'submit'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Nouvelle demande
              </button>
              <button
                onClick={() => setTab('track')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === 'track'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Suivre un ticket
              </button>
              <button
                onClick={() => setTab('faq')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === 'faq'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Aide & FAQ
              </button>
            </div>

            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Retour
              </button>
            )}
          </div>
        </div>

        {embedded && typeof window !== 'undefined' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Lien direct du portail client (à partager à vos clients) :{' '}
              </span>
              <span className="font-mono text-blue-600 dark:text-blue-400 break-all">
                {`${window.location.origin}/?portal=${orgSlug}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}/?portal=${orgSlug}`);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedLink ? 'Copié' : 'Copier le lien'}
            </button>
          </div>
        )}

        {tab === 'submit' && (
          <form
            onSubmit={handleCreate}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Déposer une réclamation ou demande SAV</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">Réponse garantie selon contrat SLA</span>
            </div>

            {submitResult && (
              <div className="p-4 border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 text-sm text-emerald-800 dark:text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Demande enregistrée sous la référence{' '}
                    <strong className="font-mono tabular-nums">{submitResult}</strong>.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTab('track');
                    handleTrack();
                  }}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 underline cursor-pointer whitespace-nowrap"
                >
                  Suivre ce dossier
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Nom complet *
                </label>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex. Marie Laurent"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Email professionnel *
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="m.laurent@entreprise.fr"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Entreprise
                </label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Raison sociale"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Domaine SAV / Catégorie
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    const found = portal?.categories.find((c) => c.name === e.target.value);
                    setSubcategory(found?.subcategories?.[0] || 'Général');
                  }}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  {(portal?.categories || []).map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Sous-domaine
                </label>
                <select
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  {(
                    portal?.categories.find((c) => c.name === category)?.subcategories || ['Général']
                  ).map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Type de service demandé
                </label>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  {SAV_SERVICE_TYPES.map((rt) => (
                    <option key={rt} value={rt}>
                      {rt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Niveau d’urgence
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="FAIBLE">Faible</option>
                  <option value="NORMALE">Normale</option>
                  <option value="ELEVEE">Élevée</option>
                  <option value="URGENTE">Urgente</option>
                  <option value="CRITIQUE">Critique</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Objet *
                </label>
                <input
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Résumé précis de votre demande (ex. Renouvellement certification, incident...)"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Description détaillée *
              </label>
              <textarea
                required
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Précisez votre numéro de commande, facture ou contexte technique..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div className="flex justify-end">
              <button
                disabled={submitting}
                style={{ backgroundColor: accentColor }}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-95 disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Envoi en cours...' : 'Transmettre la demande'}
              </button>
            </div>
          </form>
        )}

        {tab === 'track' && (
          <div className="space-y-5">
            <form
              onSubmit={handleTrack}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-end gap-4"
            >
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Numéro de ticket
                </label>
                <input
                  value={trackNum}
                  onChange={(e) => setTrackNum(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Email associé au dossier
                </label>
                <input
                  type="email"
                  value={trackEmail}
                  onChange={(e) => setTrackEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <button
                type="submit"
                style={{ backgroundColor: accentColor }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                <Search className="w-4 h-4" />
                Consulter le dossier
              </button>
            </form>

            {trackError && (
              <div className="p-3.5 text-sm border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-lg">
                {trackError}
              </div>
            )}

            {feedbackSuccess && (
              <div className="p-3.5 text-sm border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-lg">
                {feedbackSuccess}
              </div>
            )}

            {tracked && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {tracked.ticket.ticketNumber} · {tracked.ticket.category} ·{' '}
                        {STATUS_LABELS[tracked.ticket.status as TicketStatus] || tracked.ticket.status}
                      </p>
                      <h3 className="font-display text-base font-semibold mt-1">{tracked.ticket.subject}</h3>
                    </div>
                    {tracked.ticket.status !== 'CLOTURE' && (
                      <button
                        onClick={() => handleSendReply(true, false)}
                        className="px-3 py-1.5 text-xs font-medium border border-emerald-600 text-emerald-700 dark:text-emerald-400 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer whitespace-nowrap"
                      >
                        Confirmer la résolution
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {tracked.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-lg border text-sm ${
                          m.authorType === 'CUSTOMER'
                            ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                            : 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{m.authorName}</span>
                          <span className="font-mono tabular-nums">
                            {new Date(m.createdAt).toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 space-y-3">
                    <textarea
                      rows={3}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Ajouter une précision ou répondre à votre conseiller..."
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                    <button
                      onClick={() => handleSendReply(false, false)}
                      disabled={!replyBody.trim()}
                      style={{ backgroundColor: accentColor }}
                      className="px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      Envoyer la réponse
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit">
                  <h4 className="font-display text-sm font-semibold">Évaluer la prise en charge</h4>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-500 dark:text-slate-400 mb-1">
                        Satisfaction CSAT ({csat}/5)
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={csat}
                        onChange={(e) => setCsat(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 dark:text-slate-400 mb-1">
                        Recommandation NPS ({nps}/10)
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        value={nps}
                        onChange={(e) => setNps(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 dark:text-slate-400 mb-1">
                        Facilité CES ({ces}/7)
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={7}
                        value={ces}
                        onChange={(e) => setCes(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={surveyComment}
                      onChange={(e) => setSurveyComment(e.target.value)}
                      placeholder="Commentaire libre..."
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                    <button
                      onClick={() => handleSendReply(false, true)}
                      className="w-full py-2 text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg cursor-pointer"
                    >
                      Soumettre mon avis
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'faq' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(portal?.articles || []).map((art) => (
              <article
                key={art.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2"
              >
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{art.category}</span>
                  <span>·</span>
                  <span>{art.articleType}</span>
                </div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">{art.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed">
                  {art.content}
                </p>
              </article>
            ))}
            {(portal?.articles || []).length === 0 && (
              <div className="col-span-full p-8 text-center text-sm text-slate-500">
                <FileText className="w-6 h-6 mx-auto mb-2 opacity-50" />
                Aucun article public publié pour cette organisation.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
