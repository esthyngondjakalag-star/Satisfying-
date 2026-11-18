import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Send } from 'lucide-react';
import { SurveyQuestion } from '../types/workspace';

interface PublicSurveyPayload {
  invitation: {
    id: number;
    token: string;
    channel: string;
    status: 'SENT' | 'COMPLETED';
    sentAt: string;
    completedAt: string | null;
  };
  organization: {
    id: number;
    name: string;
    slug: string;
    portalTitle: string;
    primaryColor: string;
  };
  template: {
    id: number;
    title: string;
    description: string;
    targetCategory: string;
    includeCsat: boolean;
    includeNps: boolean;
    includeCes: boolean;
    questions: SurveyQuestion[];
  };
  customer: {
    id: number;
    fullName: string;
    companyName: string;
  };
  ticket: {
    id: number;
    ticketNumber: string;
    subject: string;
    category: string;
    subcategory: string;
    requestType: string;
  } | null;
}

export function PublicSurveyRunner({
  token,
  onBack,
  onSubmitted,
  embedded = false,
}: {
  token: string;
  onBack?: () => void;
  onSubmitted?: () => Promise<void> | void;
  embedded?: boolean;
}) {
  const [payload, setPayload] = useState<PublicSurveyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [csatScore, setCsatScore] = useState(5);
  const [npsScore, setNpsScore] = useState(9);
  const [cesScore, setCesScore] = useState(6);
  const [answersMap, setAnswersMap] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedDone, setSubmittedDone] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSubmittedDone(false);
    fetch(`/api/portal/survey/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || 'Sondage introuvable.');
        setPayload(json);
        const initAnswers: Record<string, string> = {};
        (json.template?.questions || []).forEach((q: SurveyQuestion) => {
          if (q.type === 'RATING_5') initAnswers[q.id] = '5 / 5';
          else if (q.type === 'YES_NO') initAnswers[q.id] = 'Oui';
          else initAnswers[q.id] = '';
        });
        setAnswersMap(initAnswers);
      })
      .catch((err: any) => setError(err?.message || 'Erreur lors du chargement.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payload) return;
    setSubmitting(true);
    setError(null);
    try {
      const customAnswers = (payload.template.questions || []).map((q) => ({
        questionId: q.id,
        label: q.label,
        answer: answersMap[q.id] || 'Non renseigné',
      }));
      const res = await fetch(`/api/portal/survey/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csatScore,
          npsScore,
          cesScore,
          customAnswers,
          comment,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur lors de l’envoi.');
      setSubmittedDone(true);
      if (onSubmitted) await onSubmitted();
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la validation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[320px] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Chargement du questionnaire client...
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="max-w-xl mx-auto p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-4">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour
          </button>
        )}
      </div>
    );
  }

  if (!payload) return null;

  const accent = payload.organization.primaryColor || '#2563EB';
  const alreadyCompleted = payload.invitation.status === 'COMPLETED' || submittedDone;

  return (
    <div className={embedded ? '' : 'min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4'}>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Branded Survey Header */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              style={{ backgroundColor: accent }}
              className="w-10 h-10 rounded-lg text-white font-display font-bold flex items-center justify-center text-sm shrink-0"
            >
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {payload.organization.name}
              </p>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {payload.template.title}
              </h1>
            </div>
          </div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Retour
            </button>
          )}
        </div>

        {alreadyCompleted ? (
          <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 rounded-xl p-8 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Merci {payload.customer.fullName}, votre avis a bien été enregistré
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Vos réponses permettent à nos équipes qualité et service après-vente d’améliorer en continu la prise en charge de vos dossiers.
            </p>
            {onBack && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onBack}
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg cursor-pointer"
                >
                  Fermer le sondage
                </button>
              </div>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6"
          >
            {/* Context block */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                Bonjour {payload.customer.fullName}
                {payload.customer.companyName ? ` (${payload.customer.companyName})` : ''}
              </p>
              {payload.template.description && (
                <p className="text-slate-600 dark:text-slate-400">{payload.template.description}</p>
              )}
              {payload.ticket && (
                <p className="font-mono text-slate-500 dark:text-slate-400 pt-1">
                  Dossier concerné : {payload.ticket.ticketNumber} · {payload.ticket.category} /{' '}
                  {payload.ticket.subcategory} — {payload.ticket.subject}
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 text-xs border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg">
                {error}
              </div>
            )}

            {/* CSAT 1..5 */}
            {payload.template.includeCsat && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                  1. Quelle est votre satisfaction globale suite au traitement de votre demande ? (CSAT)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { v: 1, label: 'Très insatisfait' },
                    { v: 2, label: 'Insatisfait' },
                    { v: 3, label: 'Neutre' },
                    { v: 4, label: 'Satisfait' },
                    { v: 5, label: 'Très satisfait' },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setCsatScore(opt.v)}
                      className={`p-2.5 rounded-lg border text-center transition-colors cursor-pointer ${
                        csatScore === opt.v
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span className="block font-mono tabular-nums text-base font-bold">{opt.v}</span>
                      <span className="block text-[10px] mt-0.5 leading-tight">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* NPS 0..10 */}
            {payload.template.includeNps && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                  2. Quelle est la probabilité que vous recommandiez nos services à un confrère ? (NPS 0 à 10)
                </label>
                <div className="grid grid-cols-11 gap-1">
                  {Array.from({ length: 11 }, (_, i) => i).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setNpsScore(val)}
                      className={`py-2 rounded-md border font-mono tabular-nums text-xs font-semibold cursor-pointer transition-colors ${
                        npsScore === val
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Pas du tout probable</span>
                  <span>Extrêmement probable</span>
                </div>
              </div>
            )}

            {/* CES 1..7 */}
            {payload.template.includeCes && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                  3. A-t-il été facile d’obtenir une réponse ou résolution ? (CES 1 à 7)
                </label>
                <div className="grid grid-cols-7 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCesScore(val)}
                      className={`py-2 rounded-md border font-mono tabular-nums text-xs font-semibold cursor-pointer ${
                        cesScore === val
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Très difficile</span>
                  <span>Sans effort</span>
                </div>
              </div>
            )}

            {/* Custom Questions (Certification, SAV, Formation...) */}
            {(payload.template.questions || []).length > 0 && (
              <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Questions spécifiques
                </h2>
                {payload.template.questions.map((q) => (
                  <div key={q.id} className="space-y-2">
                    <label className="block text-xs font-medium text-slate-800 dark:text-slate-200">
                      {q.label} {q.required ? '*' : ''}
                    </label>

                    {q.type === 'RATING_5' && (
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5].map((num) => {
                          const valStr = `${num} / 5`;
                          const active = answersMap[q.id] === valStr;
                          return (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setAnswersMap((m) => ({ ...m, [q.id]: valStr }))}
                              className={`py-2 rounded-md border font-mono tabular-nums text-xs font-semibold cursor-pointer ${
                                active
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              {valStr}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {q.type === 'YES_NO' && (
                      <div className="flex gap-2">
                        {['Oui', 'Partiellement', 'Non'].map((opt) => {
                          const active = answersMap[q.id] === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setAnswersMap((m) => ({ ...m, [q.id]: opt }))}
                              className={`px-4 py-2 rounded-md border text-xs font-medium cursor-pointer ${
                                active
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {q.type === 'TEXT' && (
                      <textarea
                        rows={2}
                        required={q.required}
                        value={answersMap[q.id] || ''}
                        onChange={(e) => setAnswersMap((m) => ({ ...m, [q.id]: e.target.value }))}
                        placeholder="Votre réponse..."
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* General Comment */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Commentaire libre / retour complémentaire
              </label>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Partagez votre retour d’expérience avec notre équipe..."
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                style={{ backgroundColor: accent }}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-95 disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Envoi en cours...' : 'Envoyer mes réponses'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
