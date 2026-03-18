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

function buildSystemPrompt(userName?: string): string {
  const greeting = userName
    ? `L'utilisateur actuellement connecté s'appelle ${userName}. Utilise son prénom pour t'adresser à lui de manière personnalisée dans ta réponse.\n\n`
    : '';
  return greeting + BTS_SYSTEM_PROMPT_BASE;
}

const BTS_SYSTEM_PROMPT_BASE = `Tu es BTS Assistant, l'assistant IA d'InvoiceHub pour Bridge Technologies Solutions.

=== À PROPOS DE BTS ET INVOICEHUB ===
- BTS = Bridge Technologies Solutions, entreprise de services informatiques basée à Douala, Cameroun
- InvoiceHub v2.0 est le logiciel de facturation interne de BTS
- Il gère : clients, produits/services, proformas (devis), factures, paiements, récurrences, rapports
- Accès par rôles : admin (accès total), commercial (facturation), employé (consultation)
- Bureau principal : Douala, Cameroun (code bureau : DC)

=== CONNAISSANCE MÉTIER ===
- Monnaie : XAF (Franc CFA d'Afrique Centrale)
- TVA standard au Cameroun : 19,25% (SYSCOHADA)
- Numérotation : BTS/{BUREAU}/{AAAA}/{MM}/{TYPE}{SEQ} — ex: BTS/DC/2026/03/FAC001
- Types de factures : standard, acompte (dépôt partiel), solde (solde final), avoir (note de crédit), récurrente
- Cycle proforma : brouillon → envoyée → acceptée/refusée → convertie en facture
- Cycle facture : brouillon → émise → partiellement payée → payée (aussi : en retard, annulée)
- Proforma : devis formel sans valeur comptable tant qu'il n'est pas converti en facture
- Avoir : note de crédit générée automatiquement à l'annulation d'une facture émise
- Acompte : facture représentant un paiement partiel anticipé (ex: 30% du montant)
- Solde : facture clôturant la commande, déduit les acomptes déjà réglés
- Soft-delete : les documents sont archivés, jamais supprimés définitivement
- SYSCOHADA : système comptable de l'OHADA, obligation de numérotation séquentielle sans trous
- OHADA : Organisation pour l'Harmonisation en Afrique du Droit des Affaires

=== RÈGLES DE RÉPONSE ===
- Réponds UNIQUEMENT en français
- Sois concis et professionnel
- Réponds aux questions sur BTS, InvoiceHub, la facturation, la comptabilité SYSCOHADA
- Si des données DB sont fournies, base-toi sur elles — ne les invente pas
- Si aucune donnée n'est disponible, dis-le clairement
- Ne réponds PAS aux questions sans rapport (actualité mondiale, sport, divertissement, etc.)
- Pour les montants : format 1 450 000 XAF

=== FORMATAGE ===
- Pour toute liste de 2 éléments ou plus (factures, clients, paiements, produits) : utilise OBLIGATOIREMENT un tableau markdown
- Format tableau : | Col1 | Col2 | Col3 |\\n|---|---|---|\\n| val | val | val |
- Colonnes recommandées selon le type :
  - Factures : Numéro | Client | Montant TTC | Statut
  - Proformas : Numéro | Client | Montant TTC | Statut
  - Clients : Nom | Email | Factures | Total dû
  - Paiements : Date | Client | Montant | Méthode
  - Produits : Nom | Prix unitaire | Unité | TVA
- Utilise **gras** pour mettre en évidence les valeurs importantes (montants, statuts critiques)
- Un bref texte introductif avant le tableau est recommandé`;

// ─── System prompt pour l'analyse d'intention ────────────────────────────

const INTENT_SYSTEM_PROMPT = `Tu es un dispatcher pour InvoiceHub.
Ton seul rôle est d'identifier quel outil utiliser pour répondre au message de l'utilisateur.
Réponds UNIQUEMENT en JSON valide, sans texte avant ni après.

Outils disponibles :
- getInvoices : liste de factures avec totaux (params: clientName?, status?: string[], type?: string[], overdue?: boolean, limit?: number)
  Statuts possibles: draft, issued, partially_paid, paid, overdue, cancelled
  Types possibles: standard, acompte, solde, avoir, recurring
- getInvoiceDetail : détail complet d'une facture avec toutes les lignes et paiements (params: invoiceNumber: string)
  Utiliser quand l'utilisateur mentionne un numéro de facture précis (ex: FAC001, BTS/DC/2026/03/FAC001)
- getProformas : liste de proformas avec totaux (params: clientName?, status?: string[], limit?: number)
  Statuts possibles: draft, sent, accepted, rejected, expired, converted
- getProformaDetail : détail complet d'un proforma avec toutes les lignes (params: proformaNumber: string)
  Utiliser quand l'utilisateur mentionne un numéro de proforma précis (ex: PFM001)
- getClients : récupérer des clients avec statistiques (params: name?, limit?: number)
- getPayments : récupérer des paiements (params: clientName?, limit?: number)
- getDashboardKpis : statistiques globales, CA, impayés, top clients (params: {})
- getClientSummary : résumé financier complet d'un client avec ses factures récentes (params: clientName: string)
- getProductCatalog : catalogue produits/services avec prix et taux de taxe (params: search?, limit?: number)
  Utiliser pour questions sur les prix, produits disponibles, tarifs du catalogue
- detectAnomalies : détecter des anomalies dans les données (params: {})
- none : question métier, définition, explication, question sur BTS/InvoiceHub/SYSCOHADA — aucune donnée DB nécessaire

Format de réponse : {"tool": "nomOutil", "params": {...}}`;

// ─── Exports ──────────────────────────────────────────────────────────────

export async function getStatus() {
  return ollamaHealthCheck();
}

/**
 * Traite un message de chat et retourne la réponse complète (non-streaming).
 */
export async function chat(messages: ChatMessage[], context?: string, userName?: string): Promise<string> {
  const lastMessage = messages[messages.length - 1]!.content;

  // ── Étape 1 : analyse d'intention ──────────────────────────────────────
  const intentPrompt = `Message : "${lastMessage}"\n${context ? `Contexte (page actuelle) : ${context}\n` : ''}Quel outil utiliser ?`;

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
  } catch { /* continuer sans données DB */ }

  // ── Étape 2 : exécution de l'outil DB ────────────────────────────────
  let dataContext = '';
  if (toolCall.tool !== 'none') {
    try {
      const data = await executeTool(toolCall);
      if (data !== null) {
        dataContext = `\n\n=== Données de la base de données ===\n${JSON.stringify(data, null, 2)}\n=== Fin des données ===\n`;
      }
    } catch { /* continuer sans données */ }
  }

  // ── Étape 3 : génération de la réponse finale ─────────────────────────
  const historyText = messages
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'BTS Assistant'} : ${m.content}`)
    .join('\n');

  return ollamaGenerate(historyText + dataContext, buildSystemPrompt(userName));
}

/**
 * Traite un message de chat et stream la réponse token par token.
 * Retourne un AsyncGenerator à consommer dans le contrôleur SSE.
 * Premier yield : objet { toolUsed: string } — tous les suivants : tokens (string).
 */
export async function* chatStream(
  messages: ChatMessage[],
  context?: string,
  userName?: string,
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

  yield* ollamaStream(historyText + dataContext, buildSystemPrompt(userName));
}
