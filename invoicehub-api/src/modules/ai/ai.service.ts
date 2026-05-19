import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ollamaGenerate, ollamaStream, ollamaHealthCheck } from '../../lib/ollama';
import type { ChatMessage } from './ai.schema';

export type ToolName =
  | 'getInvoices' | 'getInvoiceDetail' | 'getProformas' | 'getProformaDetail'
  | 'getClients' | 'getPayments' | 'getDashboardKpis' | 'getClientSummary'
  | 'getProductCatalog' | 'detectAnomalies' | 'none';

export interface ToolCall {
  tool:   ToolName;
  params: Record<string, unknown>;
}

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

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly fmt = (n: unknown) => Number(n ?? 0);

  async getStatus() {
    return ollamaHealthCheck();
  }

  private buildRoleContext(userName?: string, userRole?: string): string {
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
      if (userRole === 'employee') lines.push('IMPORTANT : guide uniquement vers la consultation. Si il demande une action impossible pour son rôle, renvoie-le vers un commercial ou admin.');
      else if (userRole === 'commercial') lines.push('IMPORTANT : si il demande gestion utilisateurs ou paramètres système, renvoie-le vers un admin.');
    }
    lines.push('');
    return lines.join('\n');
  }

  private buildSystemPrompt(userName?: string, userRole?: string, includeGuide = false): string {
    return this.buildRoleContext(userName, userRole) + BTS_CORE_PROMPT + (includeGuide ? USAGE_GUIDE : '');
  }

  private async executeTool(call: ToolCall): Promise<unknown> {
    switch (call.tool) {
      case 'getInvoices':       return this.getInvoices(call.params as any);
      case 'getInvoiceDetail':  return this.getInvoiceDetail(call.params as any);
      case 'getProformas':      return this.getProformas(call.params as any);
      case 'getProformaDetail': return this.getProformaDetail(call.params as any);
      case 'getClients':        return this.getClients(call.params as any);
      case 'getPayments':       return this.getPayments(call.params as any);
      case 'getDashboardKpis':  return this.getDashboardKpis();
      case 'getClientSummary':  return this.getClientSummary(call.params as any);
      case 'getProductCatalog': return this.getProductCatalog(call.params as any);
      case 'detectAnomalies':   return this.detectAnomalies();
      default:                  return null;
    }
  }

  async chat(messages: ChatMessage[], context?: string, userName?: string, userRole?: string): Promise<string> {
    const lastMessage  = messages[messages.length - 1]!.content;
    const intentPrompt = `Message : "${lastMessage}"\n${context ? `Page actuelle : ${context}\n` : ''}Quel outil utiliser ?`;

    let toolCall: ToolCall = { tool: 'none', params: {} };
    try {
      const intentRaw  = await ollamaGenerate(intentPrompt, INTENT_SYSTEM_PROMPT, 150, 2048);
      const jsonMatch  = intentRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { tool?: ToolName; params?: Record<string, unknown> };
        if (parsed.tool) toolCall = { tool: parsed.tool, params: parsed.params ?? {} };
      }
    } catch { /* continuer sans données DB */ }

    let dataContext = '';
    if (toolCall.tool !== 'none') {
      try {
        const data = await this.executeTool(toolCall);
        if (data !== null) dataContext = `\n\n=== Données de la base de données ===\n${JSON.stringify(data)}\n=== Fin des données ===\n`;
      } catch { /* continuer sans données */ }
    }

    const includeGuide = toolCall.tool === 'none';
    const numCtx = includeGuide ? 8192 : 6144;
    const historyText = messages.slice(-6).map(m => `${m.role === 'user' ? 'Utilisateur' : 'BTS Assistant'} : ${m.content}`).join('\n');
    const systemPrompt = this.buildSystemPrompt(userName, userRole, includeGuide);
    return ollamaGenerate(historyText + dataContext, systemPrompt, 2048, numCtx);
  }

  async *chatStream(messages: ChatMessage[], context?: string, userName?: string, userRole?: string): AsyncGenerator<string, void, unknown> {
    const lastMessage  = messages[messages.length - 1]!.content;
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

    let dataContext = '';
    if (toolCall.tool !== 'none') {
      try {
        const data = await this.executeTool(toolCall);
        if (data !== null) dataContext = `\n\n=== Données ===\n${JSON.stringify(data)}\n=== Fin ===\n`;
      } catch { /* continuer sans données */ }
    }

    const includeGuide = toolCall.tool === 'none';
    const numCtx = includeGuide ? 8192 : 6144;
    const historyText = messages.slice(-6).map(m => `${m.role === 'user' ? 'Utilisateur' : 'BTS Assistant'} : ${m.content}`).join('\n');
    const systemPrompt = this.buildSystemPrompt(userName, userRole, includeGuide);
    yield* ollamaStream(historyText + dataContext, systemPrompt, numCtx);
  }

  // ── DB Tools (private) ─────────────────────────────────────────────────────

  private async getInvoices(params: { clientName?: string; status?: string[]; type?: string[]; limit?: number; overdue?: boolean }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.clientName)      where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };
    if (params.status?.length)  where['status'] = { in: params.status };
    if (params.type?.length)    where['type']   = { in: params.type };
    if (params.overdue)         where['status'] = 'overdue';

    const invoices = await this.prisma.invoice.findMany({
      where: where as any,
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 10,
    });

    return invoices.map(i => ({
      number: i.number, client: (i.client as any).name, type: i.type, status: i.status,
      issueDate: i.issueDate, dueDate: i.dueDate,
      totalHt: this.fmt(i.totalHt), totalTax: this.fmt(i.totalTax), totalTtc: this.fmt(i.totalTtc),
      remiseGlobale: this.fmt(i.globalDiscountAmount), amountPaid: this.fmt(i.amountPaid), balanceDue: this.fmt(i.balanceDue),
    }));
  }

  private async getInvoiceDetail(params: { invoiceNumber?: string; clientName?: string }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.invoiceNumber) where['number'] = { contains: params.invoiceNumber, mode: 'insensitive' };
    if (params.clientName)    where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };

    const invoice = await this.prisma.invoice.findFirst({
      where: where as any,
      include: {
        client: { select: { name: true, email: true } },
        lines:  { select: { sortOrder: true, designation: true, description: true, quantity: true, unit: true, unitPriceHt: true, discountType: true, discountValue: true, discountAmount: true, taxRate: true, taxAmount: true, subtotalHt: true, netHt: true, totalTtc: true }, orderBy: { sortOrder: 'asc' } },
        payments: { where: { deletedAt: null }, select: { amount: true, method: true, paymentDate: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!invoice) return null;
    const inv = invoice as any;
    return {
      number: invoice.number, client: inv.client.name, clientEmail: inv.client.email,
      type: invoice.type, status: invoice.status, issueDate: invoice.issueDate, dueDate: invoice.dueDate,
      remiseGlobaleMontant: this.fmt(invoice.globalDiscountAmount),
      totalHt: this.fmt(invoice.totalHt), totalTax: this.fmt(invoice.totalTax), totalTtc: this.fmt(invoice.totalTtc),
      amountPaid: this.fmt(invoice.amountPaid), balanceDue: this.fmt(invoice.balanceDue),
      lignes: inv.lines.map((l: any) => ({
        designation: l.designation, quantite: this.fmt(l.quantity), unite: l.unit,
        prixUnitaireHt: this.fmt(l.unitPriceHt), tauxTva: this.fmt(l.taxRate), totalTtc: this.fmt(l.totalTtc),
      })),
      paiements: inv.payments.map((p: any) => ({ montant: this.fmt(p.amount), methode: p.method, date: p.paymentDate })),
    };
  }

  private async getProformas(params: { clientName?: string; status?: string[]; limit?: number }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.clientName)     where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };
    if (params.status?.length) where['status'] = { in: params.status };

    const proformas = await this.prisma.proforma.findMany({
      where: where as any,
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 10,
    });

    return proformas.map(p => ({
      number: p.number, client: (p.client as any).name, status: p.status,
      issueDate: p.issueDate, expiryDate: (p as any).validUntil,
      totalHt: this.fmt(p.totalHt), totalTax: this.fmt(p.totalTax), totalTtc: this.fmt(p.totalTtc),
    }));
  }

  private async getProformaDetail(params: { proformaNumber?: string; clientName?: string }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.proformaNumber) where['number'] = { contains: params.proformaNumber, mode: 'insensitive' };
    if (params.clientName)     where['client'] = { name: { contains: params.clientName, mode: 'insensitive' } };

    const proforma = await this.prisma.proforma.findFirst({
      where: where as any,
      include: {
        client: { select: { name: true } },
        lines:  { select: { sortOrder: true, designation: true, quantity: true, unit: true, unitPriceHt: true, taxRate: true, totalTtc: true }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!proforma) return null;
    const pf = proforma as any;
    return {
      number: proforma.number, client: pf.client.name, status: proforma.status,
      issueDate: proforma.issueDate, expiryDate: pf.validUntil,
      totalHt: this.fmt(proforma.totalHt), totalTax: this.fmt(proforma.totalTax), totalTtc: this.fmt(proforma.totalTtc),
      lignes: pf.lines.map((l: any) => ({
        designation: l.designation, quantite: this.fmt(l.quantity), unite: l.unit,
        prixUnitaireHt: this.fmt(l.unitPriceHt), tauxTva: this.fmt(l.taxRate), totalTtc: this.fmt(l.totalTtc),
      })),
    };
  }

  private async getClients(params: { name?: string; limit?: number }) {
    const clients = await this.prisma.client.findMany({
      where: { deletedAt: null, ...(params.name ? { name: { contains: params.name, mode: 'insensitive' } } : {}) },
      orderBy: { name: 'asc' },
      take: params.limit ?? 10,
      select: { name: true, email: true, phone: true, city: true, taxNumber: true },
    });
    return clients.map(c => ({ name: c.name, email: c.email, phone: c.phone, ville: c.city, numeroTaxe: c.taxNumber }));
  }

  private async getPayments(params: { clientName?: string; limit?: number }) {
    const payments = await this.prisma.payment.findMany({
      where: { deletedAt: null, ...(params.clientName ? { invoice: { client: { name: { contains: params.clientName, mode: 'insensitive' } } } } : {}) },
      include: { invoice: { select: { number: true, totalTtc: true, client: { select: { name: true } } } } },
      orderBy: { paymentDate: 'desc' },
      take: params.limit ?? 10,
    });
    return payments.map(p => {
      const inv = p.invoice as any;
      return { facture: inv.number, client: inv.client.name, montantFacture: this.fmt(inv.totalTtc), montantPaye: this.fmt(p.amount), methode: p.method, date: p.paymentDate };
    });
  }

  private async getDashboardKpis() {
    const startOfMonth     = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const startOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    const endOfLastMonth   = new Date(new Date().getFullYear(), new Date().getMonth(), 0);

    const [total, unpaid, overdue, thisMonth, lastMonth, topClients] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { deletedAt: null, status: { not: 'cancelled' } }, _sum: { totalTtc: true, amountPaid: true, balanceDue: true }, _count: true }),
      this.prisma.invoice.aggregate({ where: { deletedAt: null, status: { in: ['issued', 'partially_paid', 'overdue'] } }, _sum: { balanceDue: true }, _count: true }),
      this.prisma.invoice.count({ where: { deletedAt: null, status: 'overdue' } }),
      this.prisma.invoice.aggregate({ where: { deletedAt: null, status: { not: 'cancelled' }, issueDate: { gte: startOfMonth } }, _sum: { totalTtc: true }, _count: true }),
      this.prisma.invoice.aggregate({ where: { deletedAt: null, status: { not: 'cancelled' }, issueDate: { gte: startOfLastMonth, lte: endOfLastMonth } }, _sum: { totalTtc: true } }),
      this.prisma.client.findMany({ where: { deletedAt: null }, select: { name: true, invoices: { where: { deletedAt: null, status: { not: 'cancelled' } }, select: { totalTtc: true, amountPaid: true, balanceDue: true } } } }),
    ]);

    const caMoisCourant   = this.fmt(thisMonth._sum.totalTtc);
    const caMoisPrecedent = this.fmt(lastMonth._sum.totalTtc);
    const evolutionCA     = caMoisPrecedent > 0 ? Math.round((caMoisCourant - caMoisPrecedent) / caMoisPrecedent * 100) : null;

    const clientRanking = topClients
      .map(c => ({ nom: c.name, totalFacture: c.invoices.reduce((s, i) => s + this.fmt(i.totalTtc), 0), totalPaye: c.invoices.reduce((s, i) => s + this.fmt(i.amountPaid), 0), totalDu: c.invoices.reduce((s, i) => s + this.fmt(i.balanceDue), 0) }))
      .sort((a, b) => b.totalFacture - a.totalFacture)
      .slice(0, 5);

    return { caMoisCourant, caMoisPrecedent, evolutionCAPct: evolutionCA, caTotal: this.fmt(total._sum.totalTtc), encaisseTotal: this.fmt(total._sum.amountPaid), impayes: this.fmt(unpaid._sum.balanceDue), nombreFactures: total._count, nombreImpayees: unpaid._count, nombreEnRetard: overdue, facturesMoisCourant: thisMonth._count, top5Clients: clientRanking };
  }

  private async getClientSummary(params: { clientName: string }) {
    const client = await this.prisma.client.findFirst({
      where: { deletedAt: null, name: { contains: params.clientName, mode: 'insensitive' } },
      include: { invoices: { where: { deletedAt: null, status: { not: 'cancelled' } }, select: { number: true, status: true, type: true, issueDate: true, dueDate: true, totalTtc: true, amountPaid: true, balanceDue: true }, orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!client) return null;
    return {
      nom: client.name, email: client.email, telephone: client.phone, ville: client.city, numeroTaxe: client.taxNumber,
      totalFacture: client.invoices.reduce((s, i) => s + this.fmt(i.totalTtc), 0),
      totalPaye:    client.invoices.reduce((s, i) => s + this.fmt(i.amountPaid), 0),
      totalDu:      client.invoices.reduce((s, i) => s + this.fmt(i.balanceDue), 0),
      nombreFactures: client.invoices.length,
      enRetard: client.invoices.filter(i => i.status === 'overdue').length,
      dernieresFactures: client.invoices.map(i => ({ numero: i.number, statut: i.status, type: i.type, emission: i.issueDate, echeance: i.dueDate, totalTtc: this.fmt(i.totalTtc), paye: this.fmt(i.amountPaid), solde: this.fmt(i.balanceDue) })),
    };
  }

  private async getProductCatalog(params: { search?: string; name?: string; limit?: number }) {
    const keyword  = params.search ?? params.name;
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, ...(keyword ? { name: { contains: keyword, mode: 'insensitive' } } : {}) },
      include: { category: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: params.limit ?? 20,
    });
    return products.map(p => ({ nom: p.name, categorie: (p.category as any)?.name ?? 'Sans catégorie', prix: this.fmt(p.unitPriceHt), unite: p.unit, tauxTva: this.fmt(p.taxRateValue), description: p.description }));
  }

  private async detectAnomalies() {
    const anomalies: string[] = [];

    const avgResult = await this.prisma.invoice.aggregate({ where: { deletedAt: null, status: { not: 'cancelled' } }, _avg: { totalTtc: true } });
    const avg = this.fmt(avgResult._avg.totalTtc);

    if (avg > 0) {
      const lowInvoices = await this.prisma.invoice.findMany({ where: { deletedAt: null, status: { not: 'cancelled' }, totalTtc: { lt: avg * 0.1 } }, include: { client: { select: { name: true } } }, take: 3 });
      for (const inv of lowInvoices) anomalies.push(`Facture ${inv.number} (${(inv.client as any).name}) : ${this.fmt(inv.totalTtc).toLocaleString('fr-FR')} XAF — moins de 10% de la moyenne. Vérification recommandée.`);
    }

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const inactiveClients = await this.prisma.client.findMany({ where: { deletedAt: null, invoices: { none: { createdAt: { gte: ninetyDaysAgo }, deletedAt: null } } }, select: { name: true }, take: 3 });
    for (const c of inactiveClients) anomalies.push(`Client ${c.name} : aucune facture depuis plus de 90 jours.`);

    const zeroVatInvoices = await this.prisma.invoice.findMany({ where: { deletedAt: null, status: { not: 'cancelled' }, totalTax: { equals: 0 }, totalHt: { gt: 0 } }, include: { client: { select: { name: true } } }, take: 3 });
    for (const inv of zeroVatInvoices) anomalies.push(`Facture ${inv.number} (${(inv.client as any).name}) : TVA à 0 XAF sur ${this.fmt(inv.totalHt).toLocaleString('fr-FR')} XAF HT.`);

    return anomalies.length > 0 ? anomalies : ['Aucune anomalie détectée.'];
  }
}
