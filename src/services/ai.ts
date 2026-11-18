import { GoogleGenAI, Type } from '@google/genai';

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY manquante dans la configuration serveur.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface TicketAnalysisInput {
  ticketNumber: string;
  subject: string;
  description: string;
  messages: Array<{ authorName: string; authorType: string; body: string; isInternalNote: boolean }>;
  availableCategories: string[];
  kbArticles: Array<{ id: number; title: string; category: string; content: string }>;
}

export async function analyzeTicketWithAI(input: TicketAnalysisInput) {
  const ai = getGeminiClient();
  const threadText = input.messages
    .map((m) => `[${m.isInternalNote ? 'NOTE INTERNE' : m.authorType}] ${m.authorName}: ${m.body}`)
    .join('\n');

  const kbSummary = input.kbArticles
    .slice(0, 10)
    .map((a) => `ID ${a.id} | ${a.title} (${a.category}): ${a.content.slice(0, 220)}`)
    .join('\n');

  const prompt = `Analyse ce ticket SAV B2B et propose une aide à la décision précise en français.
Numéro: ${input.ticketNumber}
Sujet: ${input.subject}
Description: ${input.description}
Échanges:
${threadText || 'Aucun échange complémentaire.'}

Catégories disponibles: ${input.availableCategories.join(', ')}
Base de connaissances:
${kbSummary || 'Aucun article.'}

Causes racines valides: Erreur humaine, Problème technique, Processus défaillant, Manque de formation, Problème fournisseur, Défaut produit, Mauvaise communication, Problème de facturation, Cause inconnue.
Priorités valides: FAIBLE, NORMALE, ELEVEE, URGENTE, CRITIQUE.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Tu es un copilote IA expert en qualité de service client B2B. Tu assistes l’agent sans jamais prendre de décision autonome sans validation humaine.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestedCategory: { type: Type.STRING },
          suggestedPriority: { type: Type.STRING },
          sentiment: { type: Type.STRING, description: 'Très négatif, Négatif, Neutre ou Positif' },
          urgencyScore: { type: Type.INTEGER, description: 'Score entier de 0 à 100' },
          slaRiskWarning: { type: Type.BOOLEAN },
          suggestedRootCause: { type: Type.STRING },
          conversationSummary: { type: Type.STRING },
          recommendedAction: { type: Type.STRING },
          matchedKbIds: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
          },
        },
        required: [
          'suggestedCategory',
          'suggestedPriority',
          'sentiment',
          'urgencyScore',
          'slaRiskWarning',
          'suggestedRootCause',
          'conversationSummary',
          'recommendedAction',
          'matchedKbIds',
        ],
      },
    },
  });

  const text = (response.text ?? '{}').trim();
  return JSON.parse(text);
}

export async function generateReplySuggestionsWithAI(params: {
  subject: string;
  description: string;
  customerName: string;
  companyName: string;
  messages: Array<{ authorName: string; body: string; isInternalNote: boolean }>;
  draftToRefine?: string;
  tone?: string;
  kbContext?: string;
}) {
  const ai = getGeminiClient();
  const threadText = params.messages
    .filter((m) => !m.isInternalNote)
    .map((m) => `${m.authorName}: ${m.body}`)
    .join('\n');

  const prompt = params.draftToRefine
    ? `Corrige, améliore et reformule ce brouillon de réponse client avec un ton ${params.tone || 'professionnel et empathique'} en français.\nBrouillon: "${params.draftToRefine}"\nContexte ticket: ${params.subject} — ${params.description}`
    : `Rédige 2 propositions de réponse professionnelle en français pour le client ${params.customerName} (${params.companyName}).
Ticket: ${params.subject}
Description: ${params.description}
Historique public:
${threadText || 'Premier contact'}
Connaissance utile:
${params.kbContext || 'Aucune'}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Tu rédiges des réponses service client B2B irréprochables, claires, courtoises et orientées résolution concrète. Réponds uniquement en JSON valide.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          refinedDraft: { type: Type.STRING },
          suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                body: { type: Type.STRING },
              },
              required: ['label', 'body'],
            },
          },
        },
        required: ['refinedDraft', 'suggestions'],
      },
    },
  });

  return JSON.parse((response.text ?? '{"refinedDraft":"","suggestions":[]}').trim());
}

export async function generateQualityInsightsWithAI(params: {
  orgName: string;
  ticketStats: Array<{
    ticketNumber: string;
    category: string;
    priority: string;
    status: string;
    rootCause: string;
    slaBreached: boolean;
    subject: string;
  }>;
  lowSatisfactionComments: Array<{ category: string; csatScore: number; comment: string }>;
}) {
  const ai = getGeminiClient();
  const prompt = `Analyse les tendances opérationnelles de l'organisation "${params.orgName}" à partir de ces dossiers récents :
Tickets (${params.ticketStats.length}) :
${params.ticketStats
  .map(
    (t) =>
      `- ${t.ticketNumber} [${t.priority}/${t.status}] Cat:${t.category} | Cause:${t.rootCause} | SLA dépassé:${t.slaBreached ? 'Oui' : 'Non'} | ${t.subject}`
  )
  .join('\n')}

Retours clients sensibles :
${params.lowSatisfactionComments.map((s) => `- CSAT ${s.csatScore}/5 (${s.category}): ${s.comment}`).join('\n') || 'Aucun commentaire négatif récent.'}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Tu es un directeur qualité senior. Identifie les problèmes récurrents, les risques de churn et des plans d’action concrets en français.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: { type: Type.STRING },
          recurringPatterns: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          dissatisfactionDrivers: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          actionPlan: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['executiveSummary', 'recurringPatterns', 'dissatisfactionDrivers', 'actionPlan'],
      },
    },
  });

  return JSON.parse((response.text ?? '{}').trim());
}
