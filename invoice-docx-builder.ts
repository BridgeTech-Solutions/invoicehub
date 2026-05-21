/**
 * Logique show/hide pour le template DOCX — équivalent des conditionnels de pdf.ts
 *
 * PRINCIPE :
 * Dans pdf.ts  → ${condition ? '<tr>...</tr>' : ''}   (JS natif, facile)
 * Dans docxtpl → {#row_solde}{label}{value}{/row_solde} avec row_solde = [] ou [item]
 *
 * Docxtemplater répète la ligne pour chaque élément du tableau.
 * Tableau vide [] → ligne absente.
 * Tableau [item]  → ligne présente une fois.
 * C'est le seul moyen fiable de masquer une ligne entière.
 */

import { fmtFr } from './docx-pdf';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceDocxOptions {
  // Identité du document
  doc_type:        'FACTURE' | 'FACTURE SOLDE' | 'DEVIS' | 'PROFORMA';
  invoice_number:  string;
  invoice_date:    string;
  due_date:        string;

  // Client
  client_name:     string;
  client_address:  string;
  client_bp:       string;
  client_tel:      string;
  client_niu?:     string;   // optionnel → ligne masquée si absent
  client_rccm?:    string;   // optionnel → ligne masquée si absent

  // Lignes articles
  lines: Array<{
    reference:   string;
    designation: string;
    pu:          number;
    qty:         number;
    unit:        string;
    pt:          number;
  }>;

  // Totaux
  total_ht:     number;
  solde_ht?:    number;   // undefined → ligne SOLDE HT masquée (facture normale)
  tva_rate:     number;   // ex: 19.25
  tva_amount:   number;
  total_ttc:    number;

  // Pied optionnel
  contact_email?: string;
  notes?:         string;

  currency?: string;  // défaut: 'XAF'
}

// ─── Builder : transforme les options en données pour docxtemplater ──────────

/**
 * Construit l'objet de données prêt pour fillDocxTemplate().
 *
 * Chaque section optionnelle est transformée en tableau [] ou [item]
 * pour que docxtemplater puisse show/hide les lignes entières.
 */
export function buildInvoiceDocxData(opts: InvoiceDocxOptions): Record<string, unknown> {
  const fmt = (n: number) => fmtFr(n);
  const cur = opts.currency ?? 'XAF';

  return {
    // ── En-tête ──────────────────────────────────────────────────────────────
    doc_type:       opts.doc_type,
    invoice_number: opts.invoice_number,
    invoice_date:   opts.invoice_date,
    due_date:       opts.due_date,

    // ── Infos client ─────────────────────────────────────────────────────────
    client_name:    opts.client_name,
    client_address: opts.client_address,
    client_bp:      opts.client_bp,
    client_tel:     opts.client_tel,

    // Lignes optionnelles du bloc client : [] = masqué, [item] = affiché
    row_niu:  opts.client_niu  ? [{ value: opts.client_niu  }] : [],
    row_rccm: opts.client_rccm ? [{ value: opts.client_rccm }] : [],

    // ── Articles ─────────────────────────────────────────────────────────────
    lines: opts.lines.map(l => ({
      reference:   l.reference,
      designation: l.designation,
      pu_fmt:      fmt(l.pu),
      qty:         l.qty,
      unit:        l.unit,
      pt_fmt:      fmt(l.pt),
    })),

    // ── Totaux ────────────────────────────────────────────────────────────────
    total_ht:  fmt(opts.total_ht),

    // SOLDE HT : présent seulement pour FACTURE SOLDE
    row_solde: opts.solde_ht !== undefined
      ? [{ label: 'SOLDE HT', value: fmt(opts.solde_ht) }]
      : [],

    tva_label:  `TVA SUR SOLDE ${opts.tva_rate}%`,
    tva_amount: fmt(opts.tva_amount),
    total_ttc:  fmt(opts.total_ttc),

    // ── Pied ─────────────────────────────────────────────────────────────────
    // [] = ligne "Personne à contacter" masquée, [item] = affichée
    row_contact: opts.contact_email
      ? [{ value: opts.contact_email }]
      : [],

    // Notes : chaîne vide si absente (pas de ligne entière à masquer ici)
    notes: opts.notes ?? '',
  };
}

// ─── Usage ───────────────────────────────────────────────────────────────────

/*
// Facture normale (pas de SOLDE HT, pas de NIU/RCCM, pas de contact)
const data = buildInvoiceDocxData({
  doc_type:       'FACTURE',
  invoice_number: 'BTS/DC/2026/03/fac006',
  invoice_date:   '19/05/2026',
  due_date:       '18/06/2026',
  client_name:    'MTN CAMEROUN',
  client_address: 'Boulevard du 20 Mai',
  client_bp:      'Yaoundé-Cameroun',
  client_tel:     '+237 222 23 00 00',
  // client_niu et client_rccm absents → lignes masquées dans le DOCX
  lines: [{ reference: 'SVC-001', designation: 'Support réseau', pu: 500_000, qty: 1, unit: 'mois', pt: 500_000 }],
  total_ht:   500_000,
  // solde_ht absent → ligne SOLDE HT masquée
  tva_rate:   19.25,
  tva_amount: 96_250,
  total_ttc:  596_250,
  // contact_email absent → ligne "Personne à contacter" masquée
});

const pdf = await generateInvoicePdf(data);

// ─────────────────────────────────────────────────────────────────────────────

// Facture solde (avec SOLDE HT visible)
const dataSolde = buildInvoiceDocxData({
  doc_type:       'FACTURE SOLDE',
  // ...
  solde_ht:       160_000,   // ← présent → ligne affichée
  client_niu:     'M0200000005A',   // ← présent → ligne NIU affichée
  client_rccm:    'RC/YAO/1987/B/0012',
  contact_email:  'admin@bts.cm',
});
*/
