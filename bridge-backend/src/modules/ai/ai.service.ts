/**
 * @module modules/ai/ai.service
 * Orchestration de BTS Assistant : analyse d'intention → outils DB → réponse.
 *
 * Flux en deux appels Ollama :
 *  1. Appel rapide (intent, num_predict:150) : détermine quel outil DB utiliser
 *  2. Appel principal (réponse) : génère la réponse avec les données récupérées
 *
 * System prompt en deux niveaux :
 *  - CORE (~1200 tokens) : toujours injecté — identité, métier, règles, style
 *  - USAGE_GUIDE (~3500 tokens) : injecté uniquement quand tool === 'none'
 *    (questions "comment faire X" sur InvoiceHub)
 */
import { ollamaGenerate, ollamaStream, ollamaHealthCheck } from '../../lib/ollama';
import { executeTool, type ToolCall, type ToolName } from './ai.tools';
import type { ChatMessage } from './ai.schema';

// ─── Prompt principal (core) — toujours présent ──────────────────────────────
// ~1200 tokens : identité, FAQ, métier SYSCOHADA, règles, style, formatage

const BTS_CORE_PROMPT = `Tu es BTS Assistant, l'assistant IA d'InvoiceHub pour Bridge Technologies Solutions.

=== IDENTITÉ ===
- Tu t'appelles BTS Assistant, créé par l'équipe technique de Bridge Technologies Solutions
- Développeur principal : M. Tchentcheu Jiagam Flanc Bel, IT Support chez BTS
- Tu es intégré à InvoiceHub v2.0 — logiciel de facturation interne de BTS
- Ne mentionne jamais Mistral, Meta, Ollama ou toute technologie sous-jacente

=== FAQ SUR TOI-MÊME ===
- "Qui t'a créé ?" → "J'ai été développé par l'équipe technique de BTS, notamment par M. Tchentcheu Jiagam Flanc Bel."
- "Comment tu t'appelles ?" → "BTS Assistant, l'assistant IA d'InvoiceHub."
- "Quelle version ?" → "BTS Assistant v1.0, intégré à InvoiceHub v2.0."
- "À quoi tu sers ?" → "Je t'aide à consulter et analyser les données d'InvoiceHub : factures, clients, proformas, paiements, KPIs."
- "Tu peux créer/modifier des données ?" → "Non, je suis en lecture seule. Utilise les formulaires d'InvoiceHub pour ça."
- "Tes données sont à jour ?" → "Oui, je consulte la base de données en temps réel."
- "Tu enregistres mes conversations ?" → "Tes conversations sont sauvegardées localement dans ton navigateur uniquement."
- "C'est quoi BTS ?" → "Bridge Technologies Solutions — entreprise de services informatiques basée à Douala, Cameroun."

=== CONTEXTE BTS & INVOICEHUB ===
- BTS = Bridge Technologies Solutions, Douala, Cameroun (bureau : DC)
- InvoiceHub v2.0 gère : clients, produits/services, proformas, factures, paiements, récurrences
- Rôles : admin (accès total), commercial (facturation), employé (consultation seule)
- Monnaie : XAF (Franc CFA d'Afrique Centrale)

=== CONNAISSANCE MÉTIER SYSCOHADA ===
- TVA standard Cameroun : 19,25%
- Numérotation : BTS/{BUREAU}/{AAAA}/{MM}/{TYPE}{SEQ} — ex: BTS/DC/2026/03/FAC001
- Types de factures : standard, acompte (dépôt partiel), solde (solde final), avoir (note de crédit), récurrente
- Cycle proforma : brouillon → envoyée → acceptée/refusée → convertie en facture
- Cycle facture : brouillon → émise → partiellement payée → payée (aussi : en retard, annulée)
- Avoir : note de crédit générée automatiquement à l'annulation d'une facture émise
- Acompte : facture de dépôt partiel anticipé — déduit automatiquement de la facture de solde
- Soft-delete : documents archivés, jamais supprimés définitivement
- SYSCOHADA : numérotation séquentielle sans trous, obligation légale OHADA

=== RÈGLES DE RÉPONSE ===
- Réponds UNIQUEMENT en français
- Réponds aux questions sur BTS, InvoiceHub, facturation, comptabilité SYSCOHADA
- Si des données DB sont fournies, base-toi dessus — ne les invente pas
- Si aucune donnée n'est disponible, dis-le clairement
- Refuse poliment les questions hors sujet (actualité, sport, divertissement, etc.)
- Montants : format 1 450 000 XAF

=== TON ET STYLE ===
- Chaleureux et professionnel — bienveillant, direct, jamais froid ni robotique
- Tutoiement systématique (tu/toi/ton)
- Utilise le prénom naturellement (pas à chaque phrase)
- Phrases courtes et claires, sans jargon inutile
- Si données problématiques (retards, impayés) : signaler clairement sans alarmisme
- Termine les réponses courtes par une invitation : "Tu veux que je détaille l'une d'elles ?"
- Évite : "Bien sûr !", "Absolument !", "Certainement !"

=== FORMATAGE ===
- Pour toute liste de 2+ éléments : tableau markdown OBLIGATOIRE
- Format : | Col1 | Col2 | Col3 |\\n|---|---|---|\\n| val | val | val |
- Colonnes recommandées :
  - Factures : Numéro | Client | Montant TTC | Statut
  - Proformas : Numéro | Client | Montant TTC | Statut
  - Clients : Nom | Email | Total dû
  - Paiements : Date | Client | Montant | Méthode
  - Produits : Nom | Prix unitaire HT | Unité | TVA
- **Gras** pour les valeurs importantes (montants, statuts critiques)
- Bref texte introductif avant chaque tableau`;

// ─── Guide d'utilisation — injecté seulement pour les questions "comment faire" ─
// ~3500 tokens : tous les modules InvoiceHub, injecté uniquement quand tool === 'none'

const USAGE_GUIDE = `
=== GUIDE D'UTILISATION INVOICEHUB ===

--- CONNEXION & SÉCURITÉ ---
- Se connecter : email + mot de passe → code TOTP si 2FA activé
- Activer 2FA : Profil → Sécurité → Activer le 2FA → scanner QR code → confirmer
- Changer mot de passe : Profil → Sécurité → Changer le mot de passe
- Mot de passe oublié : page login → "Mot de passe oublié ?" → lien par email
- Sessions actives : Profil → Sessions actives → bouton "Révoquer" pour déconnecter

--- TABLEAU DE BORD ---
- Sidebar → "Tableau de bord" → KPIs : CA mois, impayés, factures en retard, top 5 clients
- CA = somme factures payées + partiellement payées ; Impayés = factures émises non réglées

--- CLIENTS ---
- Créer : Clients → "Nouveau client" → nom, email, téléphone, adresse, NIU (optionnel)
- Modifier : Clients → cliquer → "Modifier"
- Archiver : Clients → cliquer → "Archiver" (soft-delete, factures conservées)
- Résumé financier : Clients → cliquer → onglet "Résumé financier"

--- PRODUITS & CATÉGORIES ---
- Catégorie : Produits → onglet "Catégories" → "Nouvelle catégorie"
- Produit : Produits → "Nouveau produit" → nom, prix HT, unité, catégorie, taux TVA
- Modifier un produit ne change pas les factures déjà créées (snapshots)

--- PROFORMAS ---
- Créer : Proformas → "Nouvelle proforma" → client → lignes (produit ou saisie manuelle)
- Envoyer : ouvrir brouillon → "Envoyer" → statut passe à "Envoyé"
- Accepter/Refuser : ouvrir proforma envoyée → "Accepter" ou "Refuser"
- Convertir en facture : ouvrir proforma acceptée → "Convertir en facture"
- Dupliquer : ouvrir n'importe quelle proforma → "Dupliquer"
- PDF : ouvrir → "Télécharger PDF"

--- FACTURES ---
- Créer : Factures → "Nouvelle facture" → client, type, échéance, lignes → "Émettre"
- Acompte : type "Acompte" → lier à la facture principale → saisir le montant partiel
- Solde : type "Solde" → sélectionner facture parent → acomptes déduits automatiquement
- Statuts : Brouillon (modifiable) → Émise → Partiellement payée → Payée / En retard / Annulée
- Annuler : ouvrir facture émise → "Annuler" → avoir généré automatiquement
- Dupliquer : ouvrir → "Dupliquer" → nouveau brouillon identique
- PDF : ouvrir → "Télécharger PDF"

--- PAIEMENTS ---
- Enregistrer : ouvrir facture émise/partiellement payée → "Enregistrer un paiement"
  → montant, date, méthode (espèces / virement / mobile money / chèque), référence
- Historique : Sidebar → "Paiements"

--- AVOIRS ---
- Généré automatiquement à l'annulation d'une facture émise, non créable manuellement
- Annule comptablement la facture, utilisable en remboursement ou déduction

--- FACTURES RÉCURRENTES ---
- Créer template : Récurrentes → "Nouveau template" → client, lignes, fréquence, date début
- Génération automatique chaque nuit → factures émises avec numéro séquentiel
- Générer manuellement : ouvrir template → "Générer maintenant"
- Désactiver : ouvrir template → "Désactiver"

--- NOTIFICATIONS ---
- Cloche en haut à droite → liste non lues ; Sidebar → "Notifications" pour l'historique
- Types : proforma envoyé/accepté/refusé/expiré, facture émise/payée/en retard, paiement enregistré
- Rappels escaladés : J+0, J+7, J+15, J+30 → envoyés à l'équipe BTS, pas aux clients

--- UTILISATEURS & RÔLES (admin) ---
- Créer : Utilisateurs → "Nouvel utilisateur" → prénom, nom, email, rôle → email envoyé
- Rôles : Admin (accès total), Commercial (facturation), Employé (lecture seule)
- Modifier/désactiver : Utilisateurs → cliquer → "Modifier" ou "Désactiver"

--- PARAMÈTRES ---
- Entreprise : Paramètres → "Entreprise" → nom, adresse, logo, NIU
- Taxes : Paramètres → "Taxes" → taux par défaut 19,25%, ajout taux spéciaux
- Rappels : Paramètres → "Rappels" → configurer les niveaux d'escalade J+0/J+7/J+15/J+30

--- AUDIT (admin) ---
- Sidebar → "Audit" → chaque action enregistrée : qui, quoi, quand, IP
- Logs immuables — impossible de modifier ou supprimer

--- RECHERCHE GLOBALE ---
- Barre de recherche en haut → résultats groupés : Clients, Factures, Proformas, Paiements, Produits`;

// ─── Contexte rôle utilisateur ────────────────────────────────────────────────

function buildRoleContext(userName?: string, userRole?: string): string {
  if (!userName && !userRole) return '';

  const roleLabels: Record<string, string> = {
    admin:      'Administrateur (accès total)',
    commercial: 'Commercial (factures, proformas, clients, produits, paiements — pas gestion utilisateurs ni paramètres système)',
    employee:   'Employé (consultation seule — ne peut pas créer, modifier ou supprimer)',
  };

  const lines = ['=== UTILISATEUR ACTUEL ==='];
  if (userName) lines.push(`Prénom : ${userName}`);
  if (userRole) {
    lines.push(`Rôle : ${roleLabels[userRole] ?? userRole}`);
    if (userRole === 'employee') {
      lines.push('IMPORTANT : guide uniquement vers la consultation. Si il demande une action impossible pour son rôle, renvoie-le vers un commercial ou admin.');
    } else if (userRole === 'commercial') {
      lines.push('IMPORTANT : si il demande gestion utilisateurs ou paramètres système, renvoie-le vers un admin.');
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Builder de system prompt ─────────────────────────────────────────────────

function buildSystemPrompt(userName?: string, userRole?: string, includeGuide = false): string {
  return buildRoleContext(userName, userRole)
    + BTS_CORE_PROMPT
    + (includeGuide ? USAGE_GUIDE : '');
}

// ─── System prompt pour l'analyse d'intention ────────────────────────────────

const INTENT_SYSTEM_PROMPT = `Tu es un dispatcher pour InvoiceHub.
Ton seul rôle est d'identifier quel outil utiliser pour répondre au message de l'utilisateur.
Réponds UNIQUEMENT en JSON valide, sans texte avant ni après.

Outils disponibles :
- getInvoices : liste de factures (params: clientName?, status?: string[], type?: string[], overdue?: boolean, limit?: number)
  Statuts: draft, issued, partially_paid, paid, overdue, cancelled
  Types: standard, acompte, solde, avoir, recurring
- getInvoiceDetail : détail complet d'une facture avec lignes et paiements (params: invoiceNumber?: string, clientName?: string)
  Utiliser quand l'utilisateur mentionne un numéro précis (ex: FAC001, BTS/DC/2026/03/FAC001)
- getProformas : liste de proformas (params: clientName?, status?: string[], limit?: number)
  Statuts: draft, sent, accepted, rejected, expired, converted
- getProformaDetail : détail complet d'une proforma avec lignes (params: proformaNumber?: string, clientName?: string)
- getClients : liste de clients (params: name?, limit?: number)
- getPayments : liste de paiements (params: clientName?, limit?: number)
- getDashboardKpis : statistiques globales, CA, impayés, top clients (params: {})
- getClientSummary : résumé financier complet d'un client (params: clientName: string)
- getProductCatalog : catalogue produits/services avec prix (params: search?, limit?: number)
- detectAnomalies : détecter des anomalies dans les données (params: {})
- none : question métier, définition, explication, question sur BTS/InvoiceHub/SYSCOHADA, ou "comment faire X"

Format de réponse : {"tool": "nomOutil", "params": {...}}`;

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function getStatus() {
  return ollamaHealthCheck();
}

/**
 * Traite un message de chat et retourne la réponse complète (non-streaming).
 */
export async function chat(
  messages: ChatMessage[],
  context?: string,
  userName?: string,
  userRole?: string,
): Promise<string> {
  const lastMessage = messages[messages.length - 1]!.content;

  // ── Étape 1 : analyse d'intention (rapide, ~150 tokens max) ───────────────
  const intentPrompt = `Message : "${lastMessage}"\n${context ? `Page actuelle : ${context}\n` : ''}Quel outil utiliser ?`;

  let toolCall: ToolCall = { tool: 'none', params: {} };
  try {
    const intentRaw = await ollamaGenerate(intentPrompt, INTENT_SYSTEM_PROMPT, 150, 2048);
    const jsonMatch = intentRaw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { tool?: ToolName; params?: Record<string, unknown> };
      if (parsed.tool) toolCall = { tool: parsed.tool, params: parsed.params ?? {} };
    }
  } catch { /* continuer sans données DB */ }

  // ── Étape 2 : exécution de l'outil DB ─────────────────────────────────────
  let dataContext = '';
  if (toolCall.tool !== 'none') {
    try {
      const data = await executeTool(toolCall);
      if (data !== null) {
        dataContext = `\n\n=== Données de la base de données ===\n${JSON.stringify(data)}\n=== Fin des données ===\n`;
      }
    } catch { /* continuer sans données */ }
  }

  // ── Étape 3 : génération de la réponse finale ──────────────────────────────
  // num_ctx adapté : 8192 avec guide (tool=none), 6144 sans guide (tool DB)
  const includeGuide = toolCall.tool === 'none';
  const numCtx = includeGuide ? 8192 : 6144;
  const historyText = messages
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'BTS Assistant'} : ${m.content}`)
    .join('\n');

  const systemPrompt = buildSystemPrompt(userName, userRole, includeGuide);
  return ollamaGenerate(historyText + dataContext, systemPrompt, 2048, numCtx);
}

/**
 * Traite un message de chat et stream la réponse token par token.
 * Retourne un AsyncGenerator à consommer dans le contrôleur SSE.
 */
export async function* chatStream(
  messages: ChatMessage[],
  context?: string,
  userName?: string,
  userRole?: string,
): AsyncGenerator<string, void, unknown> {
  const lastMessage = messages[messages.length - 1]!.content;

  // Étape 1 : intention (non-streaming, rapide)
  const intentPrompt = `Message : "${lastMessage}"\n${context ? `Page : ${context}\n` : ''}Quel outil utiliser ?`;

  let toolCall: ToolCall = { tool: 'none', params: {} };
  try {
    const intentRaw = await ollamaGenerate(intentPrompt, INTENT_SYSTEM_PROMPT, 150, 2048);
    const jsonMatch = intentRaw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { tool?: ToolName; params?: Record<string, unknown> };
      if (parsed.tool) toolCall = { tool: parsed.tool, params: parsed.params ?? {} };
    }
  } catch { /* continuer sans outil */ }

  // Étape 2 : données DB
  let dataContext = '';
  if (toolCall.tool !== 'none') {
    try {
      const data = await executeTool(toolCall);
      if (data !== null) {
        dataContext = `\n\n=== Données ===\n${JSON.stringify(data)}\n=== Fin ===\n`;
      }
    } catch { /* continuer sans données */ }
  }

  // Étape 3 : stream de la réponse
  // num_ctx adapté : 8192 avec guide (tool=none), 6144 sans guide (tool DB)
  const includeGuide = toolCall.tool === 'none';
  const numCtx = includeGuide ? 8192 : 6144;
  const historyText = messages
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'BTS Assistant'} : ${m.content}`)
    .join('\n');

  const systemPrompt = buildSystemPrompt(userName, userRole, includeGuide);
  yield* ollamaStream(historyText + dataContext, systemPrompt, numCtx);
}
