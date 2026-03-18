/**
 * @module modules/search/search.parser
 * Parser de requête de recherche en langage naturel.
 *
 * Extrait des tokens structurés depuis une chaîne libre :
 *  - Numéros de documents   → "FAC-031", "PFM001", "BTS/DC/2026/01/FAC001"
 *  - Filtres de statut      → "impayé", "brouillon", "en retard", "accepté"
 *  - Filtres de montant     → "> 500000", "<= 250K", ">= 1M"
 *  - Filtres temporels      → "2025", "janvier", "mars 2026"
 *  - Texte libre résiduel   → utilisé pour la recherche par nom / numéro
 *
 * Les tokens consommés sont retirés du texte résiduel de sorte que
 * chaque partie de la query a une sémantique unique et non ambiguë.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type InvoiceStatusFilter =
  | 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';

export type ProformaStatusFilter =
  | 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted' | 'cancelled';

export interface ParsedQuery {
  /** Requête brute originale */
  raw: string;
  /** Texte libre après extraction de tous les tokens — recherche par nom/numéro */
  text: string;
  /** Numéro de document détecté (navigation directe) */
  documentNumber: string | null;
  /** Filtre de statut pour les factures */
  invoiceStatuses: InvoiceStatusFilter[];
  /** Filtre de statut pour les proformas */
  proformaStatuses: ProformaStatusFilter[];
  /** Montant strictement supérieur à */
  amountGt: number | null;
  /** Montant supérieur ou égal à */
  amountGte: number | null;
  /** Montant strictement inférieur à */
  amountLt: number | null;
  /** Montant inférieur ou égal à */
  amountLte: number | null;
  /** Année (ex: 2025) */
  year: number | null;
  /** Mois (1-12) */
  month: number | null;
  /** Vrai si au moins un filtre structuré a été détecté */
  hasFilters: boolean;
}

// ── Tables de correspondance ──────────────────────────────────────────────────

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2, février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8, août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12, décembre: 12,
};

/**
 * Mots-clés → statuts de factures.
 * Ordre : les phrases composées sont listées avant les mots simples
 * pour être testées en priorité.
 */
const INVOICE_STATUS_MAP: [string | RegExp, InvoiceStatusFilter[]][] = [
  [/\ben\s+retard\b/i,        ['overdue']],
  [/\bnon\s+pay[ée]s?\b/i,    ['issued', 'partially_paid', 'overdue']],
  [/\bpartiellement\s+pay[ée]s?\b/i, ['partially_paid']],
  [/\bimpay[ée]s?\b/i,        ['issued', 'partially_paid', 'overdue']],
  [/\bpay[ée]s?\b/i,          ['paid']],
  [/\bbrouillon\b/i,          ['draft']],
  [/\bdraft\b/i,              ['draft']],
  [/\b[ée]mis?\b/i,           ['issued']],
  [/\benvoy[ée]s?\b/i,        ['issued']],
  [/\b[ée]chu[e]?s?\b/i,      ['overdue']],
  [/\bannul[ée]s?\b/i,        ['cancelled']],
  [/\bpartiel(?:le)?s?\b/i,   ['partially_paid']],
];

/**
 * Mots-clés → statuts de proformas.
 */
const PROFORMA_STATUS_MAP: [string | RegExp, ProformaStatusFilter[]][] = [
  [/\ben\s+attente\b/i,       ['sent']],
  [/\bbrouillon\b/i,          ['draft']],
  [/\bdraft\b/i,              ['draft']],
  [/\benvoy[ée]s?\b/i,        ['sent']],
  [/\baccepté[e]?s?\b/i,      ['accepted']],
  [/\brejet[ée]s?\b/i,        ['rejected']],
  [/\bexpir[ée]s?\b/i,        ['expired']],
  [/\bconverti[e]?s?\b/i,     ['converted']],
  [/\bannul[ée]s?\b/i,        ['cancelled']],
];

// ── Parser principal ──────────────────────────────────────────────────────────

export function parseSearchQuery(raw: string): ParsedQuery {
  let q = raw.trim();

  const result: ParsedQuery = {
    raw,
    text: '',
    documentNumber: null,
    invoiceStatuses: [],
    proformaStatuses: [],
    amountGt: null,
    amountGte: null,
    amountLt: null,
    amountLte: null,
    year: null,
    month: null,
    hasFilters: false,
  };

  // ── 1. Numéro de document ─────────────────────────────────────────────────
  // Formats : FAC-031, FAC031, PFM-001, PFM001, BTS/DC/2026/01/FAC001
  const docRegex = /\b(BTS\/[A-Z]{1,10}\/\d{4}\/\d{2}\/(?:FAC|PFM)\d+|(?:FAC|PFM)-?\d+)\b/i;
  const docMatch = q.match(docRegex);
  if (docMatch) {
    result.documentNumber = docMatch[1].toUpperCase();
    q = q.replace(docMatch[0], '').trim();
  }

  // ── 2. Filtres de montant ─────────────────────────────────────────────────
  // Formats : > 500000, >= 250K, <1M, <= 500 000
  // Supporte les séparateurs de milliers (espace) et les suffixes K/M
  const amountRegex = /([><]=?)\s*([\d\s]+(?:[.,]\d+)?)\s*([KkMm])?/g;
  const amountMatches = [...q.matchAll(amountRegex)];

  for (const m of amountMatches) {
    const op  = m[1];
    const raw = m[2].replace(/\s/g, '').replace(',', '.'); // "500 000" → "500000"
    let   val = parseFloat(raw);
    const unit = m[3]?.toLowerCase();

    if (isNaN(val)) continue;
    if (unit === 'k') val *= 1_000;
    if (unit === 'm') val *= 1_000_000;

    if (op === '>')  result.amountGt  = val;
    if (op === '>=') result.amountGte = val;
    if (op === '<')  result.amountLt  = val;
    if (op === '<=') result.amountLte = val;
  }

  // Supprimer les tokens montant du texte
  if (amountMatches.length > 0) {
    q = q.replace(/([><]=?)\s*([\d\s]+(?:[.,]\d+)?)\s*([KkMm])?/g, '').trim();
  }

  // ── 3. Année ──────────────────────────────────────────────────────────────
  const yearRegex = /\b(20[2-3]\d)\b/;
  const yearMatch = q.match(yearRegex);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1]);
    q = q.replace(yearMatch[0], '').trim();
  }

  // ── 4. Mois ───────────────────────────────────────────────────────────────
  for (const [name, num] of Object.entries(FRENCH_MONTHS)) {
    const monthRe = new RegExp(`\\b${name}\\b`, 'i');
    if (monthRe.test(q)) {
      result.month = num;
      q = q.replace(monthRe, '').trim();
      break;
    }
  }

  // ── 5. Statuts (phrases composées d'abord, puis mots simples) ────────────
  for (const [pattern, statuses] of INVOICE_STATUS_MAP) {
    const re = typeof pattern === 'string' ? new RegExp(`\\b${pattern}\\b`, 'i') : pattern;
    if (re.test(q)) {
      result.invoiceStatuses = statuses;
      q = q.replace(re, '').trim();
      break; // un seul statut facture à la fois
    }
  }

  for (const [pattern, statuses] of PROFORMA_STATUS_MAP) {
    const re = typeof pattern === 'string' ? new RegExp(`\\b${pattern}\\b`, 'i') : pattern;
    if (re.test(q)) {
      result.proformaStatuses = statuses;
      q = q.replace(re, '').trim();
      break;
    }
  }

  // ── 6. Texte résiduel ─────────────────────────────────────────────────────
  // Nettoyage des espaces multiples et ponctuation orpheline
  result.text = q.replace(/\s{2,}/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '').trim();

  // ── 7. hasFilters ─────────────────────────────────────────────────────────
  result.hasFilters = !!(
    result.documentNumber ||
    result.invoiceStatuses.length > 0 ||
    result.proformaStatuses.length > 0 ||
    result.amountGt !== null ||
    result.amountGte !== null ||
    result.amountLt !== null ||
    result.amountLte !== null ||
    result.year !== null ||
    result.month !== null
  );

  return result;
}

/**
 * Retourne une description lisible de la requête parsée,
 * destinée à être affichée dans l'UI ("Vous cherchez : ...").
 */
export function describeParsedQuery(p: ParsedQuery): string {
  const parts: string[] = [];

  if (p.text)           parts.push(`"${p.text}"`);
  if (p.documentNumber) parts.push(`document ${p.documentNumber}`);
  if (p.invoiceStatuses.length > 0) parts.push(`statut facture : ${p.invoiceStatuses.join('/')}`);
  if (p.proformaStatuses.length > 0) parts.push(`statut proforma : ${p.proformaStatuses.join('/')}`);
  if (p.amountGt  !== null) parts.push(`montant > ${p.amountGt.toLocaleString('fr')} XAF`);
  if (p.amountGte !== null) parts.push(`montant ≥ ${p.amountGte.toLocaleString('fr')} XAF`);
  if (p.amountLt  !== null) parts.push(`montant < ${p.amountLt.toLocaleString('fr')} XAF`);
  if (p.amountLte !== null) parts.push(`montant ≤ ${p.amountLte.toLocaleString('fr')} XAF`);
  if (p.year  && p.month) parts.push(`période : ${p.month}/${p.year}`);
  else if (p.year)         parts.push(`année : ${p.year}`);
  else if (p.month)        parts.push(`mois : ${p.month}`);

  return parts.join(' · ');
}
