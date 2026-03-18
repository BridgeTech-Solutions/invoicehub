/**
 * @module modules/ai/ai.service
 * Orchestration de BTS Assistant : analyse d'intention → outils DB → réponse.
 *
 * Flux en deux appels Ollama :
 *  1. Appel rapide (intent) : détermine quel outil DB utiliser
 *  2. Appel principal (réponse) : génère la réponse en français avec les données
 *
 * Si OLLAMA_ENABLED=false, retourne une réponse d'erreur gracieuse sans planter.
 */
import { ollamaGenerate, ollamaStream, ollamaHealthCheck } from '../../lib/ollama';
import { executeTool, type ToolCall, type ToolName } from './ai.tools';
import type { ChatMessage } from './ai.schema';

// ─── System prompt BTS ────────────────────────────────────────────────────

const BTS_SYSTEM_PROMPT = `Tu es BTS Assistant, l'assistant IA d'InvoiceHub pour Bridge Technologies Solutions, une entreprise de services IT à Douala, Cameroun.

Tu peux répondre à deux types de questions :
1. Questions sur les données de l'application (factures, clients, proformas, paiements, statistiques) — tu utilises les données fournies dans le prompt.
2. Questions métier et définitions — tu réponds depuis ta connaissance du domaine.

Connaissance métier :
- Monnaie : XAF (Franc CFA d'Afrique Centrale)
- TVA standard au Cameroun : 19,25% (SYSCOHADA)
- Numérotation BTS : BTS/{BUREAU}/{AAAA}/{MM}/{TYPE}{SEQ} — ex: BTS/DC/2026/03/FAC001
- Types de factures : standard, acompte (dépôt partiel), solde (solde final), avoir (note de crédit), récurrente
- Cycle proforma : brouillon → envoyée → acceptée/refusée → convertie en facture
- Cycle facture : brouillon → émise → partiellement payée → payée (aussi : en retard, annulée)
- Soft-delete : les documents sont archivés, jamais supprimés définitivement
- SYSCOHADA : système comptable de l'OHADA (Organisation pour l'Harmonisation en Afrique du Droit des Affaires)

Règles de réponse :
- Réponds UNIQUEMENT en français
- Sois concis et professionnel
- Si des données sont fournies, base-toi sur elles — ne les invente pas
- Si aucune donnée n'est disponible pour répondre, dis-le clairement
- Ne réponds pas aux questions hors-sujet (actualité, culture générale, etc.)
- Pour les montants, utilise le format : 1 450 000 XAF`;

// ─── System prompt pour l'analyse d'intention ────────────────────────────

const INTENT_SYSTEM_PROMPT = `Tu es un dispatcher pour InvoiceHub.
Ton seul rôle est d'identifier quel outil utiliser pour répondre au message de l'utilisateur.
Réponds UNIQUEMENT en JSON valide, sans texte avant ni après.

Outils disponibles :
- getInvoices : récupérer des factures (params: clientName?, status?: string[], type?: string[], overdue?: boolean, limit?: number)
  Statuts possibles: draft, issued, partially_paid, paid, overdue, cancelled
  Types possibles: standard, acompte, solde, avoir, recurring
- getProformas : récupérer des proformas (params: clientName?, status?: string[], limit?: number)
  Statuts possibles: draft, sent, accepted, rejected, expired, converted
- getClients : récupérer des clients (params: name?, limit?: number)
- getPayments : récupérer des paiements (params: clientName?, limit?: number)
- getDashboardKpis : statistiques globales, CA, impayés, top clients (params: {})
- getClientSummary : résumé financier d'un client précis (params: clientName: string)
- detectAnomalies : détecter des anomalies dans les données (params: {})
- none : question métier, définition, explication — aucune donnée DB nécessaire

Format de réponse : {"tool": "nomOutil", "params": {...}}`;

// ─── Exports ──────────────────────────────────────────────────────────────

export async function getStatus() {
  return ollamaHealthCheck();
}

/**
 * Traite un message de chat et retourne la réponse complète (non-streaming).
 */
export async function chat(messages: ChatMessage[], context?: string): Promise<string> {
  const lastMessage = messages[messages.length - 1]!.content;

  // ── Étape 1 : analyse d'intention ──────────────────────────────────────
  const intentPrompt = `Message : "${lastMessage}"\n${context ? `Contexte (page actuelle) : ${context}\n` : ''}Quel outil utiliser ?`;

  let toolCall: ToolCall = { tool: 'none', params: {} };
  try {
    const intentRaw = await ollamaGenerate(intentPrompt, INTENT_SYSTEM_PROMPT);
    // Extraire le JSON même si Ollama ajoute du texte autour
    const jsonMatch = intentRaw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { tool?: ToolName; params?: Record<string, unknown> };
      if (parsed.tool) {
        toolCall = { tool: parsed.tool, params: parsed.params ?? {} };
      }
    }
  } catch {
    // Si l'analyse d'intention échoue, on continue sans données DB
  }

  // ── Étape 2 : exécution de l'outil DB ────────────────────────────────
  let dataContext = '';
  if (toolCall.tool !== 'none') {
    try {
      const data = await executeTool(toolCall);
      if (data !== null) {
        dataContext = `\n\n=== Données de la base de données ===\n${JSON.stringify(data, null, 2)}\n=== Fin des données ===\n`;
      }
    } catch {
      // Si la requête DB échoue, on continue sans données
    }
  }

  // ── Étape 3 : génération de la réponse finale ─────────────────────────
  const historyText = messages
    .slice(-6) // Garder les 6 derniers messages pour le contexte
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'BTS Assistant'} : ${m.content}`)
    .join('\n');

  const finalPrompt = historyText + dataContext;

  return ollamaGenerate(finalPrompt, BTS_SYSTEM_PROMPT);
}

/**
 * Traite un message de chat et stream la réponse token par token.
 * Retourne un AsyncGenerator à consommer dans le contrôleur SSE.
 */
export async function* chatStream(
  messages: ChatMessage[],
  context?: string,
): AsyncGenerator<string, void, unknown> {
  const lastMessage = messages[messages.length - 1]!.content;

  // Étape 1 : intention (non-streaming, rapide)
  const intentPrompt = `Message : "${lastMessage}"\n${context ? `Contexte : ${context}\n` : ''}Quel outil utiliser ?`;

  let toolCall: ToolCall = { tool: 'none', params: {} };
  try {
    const intentRaw = await ollamaGenerate(intentPrompt, INTENT_SYSTEM_PROMPT);
    const jsonMatch = intentRaw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { tool?: ToolName; params?: Record<string, unknown> };
      if (parsed.tool) {
        toolCall = { tool: parsed.tool, params: parsed.params ?? {} };
      }
    }
  } catch { /* continuer sans outil */ }

  // Étape 2 : données DB
  let dataContext = '';
  if (toolCall.tool !== 'none') {
    try {
      const data = await executeTool(toolCall);
      if (data !== null) {
        dataContext = `\n\n=== Données ===\n${JSON.stringify(data, null, 2)}\n=== Fin ===\n`;
      }
    } catch { /* continuer sans données */ }
  }

  // Étape 3 : stream de la réponse
  const historyText = messages
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'BTS Assistant'} : ${m.content}`)
    .join('\n');

  yield* ollamaStream(historyText + dataContext, BTS_SYSTEM_PROMPT);
}
