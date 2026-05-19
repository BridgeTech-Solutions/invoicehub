export type InvoiceStatusFilter =
  | 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';

export type ProformaStatusFilter =
  | 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted' | 'cancelled';

export interface ParsedQuery {
  raw: string;
  text: string;
  documentNumber: string | null;
  invoiceStatuses: InvoiceStatusFilter[];
  proformaStatuses: ProformaStatusFilter[];
  amountGt: number | null;
  amountGte: number | null;
  amountLt: number | null;
  amountLte: number | null;
  year: number | null;
  month: number | null;
  hasFilters: boolean;
}

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

export function parseSearchQuery(raw: string): ParsedQuery {
  let q = raw.trim();

  const result: ParsedQuery = {
    raw, text: '', documentNumber: null,
    invoiceStatuses: [], proformaStatuses: [],
    amountGt: null, amountGte: null, amountLt: null, amountLte: null,
    year: null, month: null, hasFilters: false,
  };

  const docRegex = /\b(BTS\/[A-Z]{1,10}\/\d{4}\/\d{2}\/(?:FAC|PFM)\d+|(?:FAC|PFM)-?\d+)\b/i;
  const docMatch = q.match(docRegex);
  if (docMatch) {
    result.documentNumber = docMatch[1].toUpperCase();
    q = q.replace(docMatch[0], '').trim();
  }

  const amountRegex = /([><]=?)\s*([\d\s]+(?:[.,]\d+)?)\s*([KkMm])?/g;
  const amountMatches = [...q.matchAll(amountRegex)];
  for (const m of amountMatches) {
    const op  = m[1];
    const raw = m[2].replace(/\s/g, '').replace(',', '.');
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
  if (amountMatches.length > 0) {
    q = q.replace(/([><]=?)\s*([\d\s]+(?:[.,]\d+)?)\s*([KkMm])?/g, '').trim();
  }

  const yearRegex = /\b(20[2-3]\d)\b/;
  const yearMatch = q.match(yearRegex);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1]);
    q = q.replace(yearMatch[0], '').trim();
  }

  for (const [name, num] of Object.entries(FRENCH_MONTHS)) {
    const monthRe = new RegExp(`\\b${name}\\b`, 'i');
    if (monthRe.test(q)) {
      result.month = num;
      q = q.replace(monthRe, '').trim();
      break;
    }
  }

  for (const [pattern, statuses] of INVOICE_STATUS_MAP) {
    const re = typeof pattern === 'string' ? new RegExp(`\\b${pattern}\\b`, 'i') : pattern;
    if (re.test(q)) {
      result.invoiceStatuses = statuses;
      q = q.replace(re, '').trim();
      break;
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

  result.text = q.replace(/\s{2,}/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '').trim();

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

export function describeParsedQuery(p: ParsedQuery): string {
  const parts: string[] = [];
  if (p.text)           parts.push(`"${p.text}"`);
  if (p.documentNumber) parts.push(`document ${p.documentNumber}`);
  if (p.invoiceStatuses.length > 0)  parts.push(`statut facture : ${p.invoiceStatuses.join('/')}`);
  if (p.proformaStatuses.length > 0) parts.push(`statut proforma : ${p.proformaStatuses.join('/')}`);
  if (p.amountGt  !== null) parts.push(`montant > ${p.amountGt.toLocaleString('fr')} XAF`);
  if (p.amountGte !== null) parts.push(`montant ≥ ${p.amountGte.toLocaleString('fr')} XAF`);
  if (p.amountLt  !== null) parts.push(`montant < ${p.amountLt.toLocaleString('fr')} XAF`);
  if (p.amountLte !== null) parts.push(`montant ≤ ${p.amountLte.toLocaleString('fr')} XAF`);
  if (p.year && p.month)    parts.push(`période : ${p.month}/${p.year}`);
  else if (p.year)          parts.push(`année : ${p.year}`);
  else if (p.month)         parts.push(`mois : ${p.month}`);
  return parts.join(' · ');
}
