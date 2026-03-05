/**
 * @module lib/pdf
 * Génération de PDF via Puppeteer (Chromium headless).
 *
 * Deux fonctions publiques :
 *  - `generatePdf(html)` : transforme du HTML en buffer PDF format A4
 *  - `buildDocumentHtml(params)` : construit le HTML d'une proforma ou d'une facture
 *    à partir des données métier, en respectant l'identité visuelle BTS.
 */
import puppeteer from 'puppeteer';
import { logger } from '../core/middleware/requestLogger';

/**
 * Génère un document PDF au format A4 à partir d'une chaîne HTML complète.
 *
 * Lance une instance Chromium headless, injecte le HTML, attend que le réseau
 * soit idle (images, fonts chargés) puis exporte en PDF. L'instance est
 * toujours fermée même en cas d'erreur (bloc `finally`).
 *
 * @param html - HTML complet du document (avec `<html>`, `<head>`, styles inlinés)
 * @returns Buffer binaire du PDF — à envoyer directement en réponse HTTP ou à sauvegarder
 * @throws Si Puppeteer ne peut pas démarrer ou si le rendu échoue
 */
export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',           // Requis dans les environnements Docker/CI sans user namespace
      '--disable-setuid-sandbox',
    ],
  });

  try {
    const page = await browser.newPage();

    // `networkidle0` attend que 0 requête réseau soit en cours pendant 500ms
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true, // Indispensable pour les couleurs de fond
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });

    logger.debug('PDF generated', { size: pdf.length });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Paramètres du template HTML
// ---------------------------------------------------------------------------

/** Paramètres de construction du template HTML d'un document commercial */
export interface DocumentHtmlParams {
  /** Type de document affiché en titre et badge */
  type: 'Proforma' | 'Facture' | 'Avoir';
  /** Numéro SYSCOHADA (ex: BTS/DC/2026/01/fac001) */
  number: string;
  /** Date d'émission formatée en FR (ex: 01/03/2026) */
  issueDate: string;
  /** Date d'échéance (factures uniquement) */
  dueDate?: string;
  /** Date limite de validité (proformas uniquement) */
  validUntil?: string;
  // -- Émetteur (BTS) --
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  /** NIU Cameroun de l'entreprise */
  companyTaxNumber?: string;
  // -- Client --
  clientName: string;
  clientAddress?: string;
  clientEmail?: string;
  /** NIU Cameroun du client */
  clientTaxNumber?: string;
  /** Objet du document */
  subject?: string;
  /** Lignes de détail */
  lines: Array<{
    designation: string;
    quantity: number;
    unit: string;
    unitPriceHt: number;
    taxRate: number;
    totalTtc: number;
  }>;
  /** Total HT après remises globales */
  subtotalHt: number;
  totalTax: number;
  totalTtc: number;
  notes?: string;
  paymentConditions?: string;
  /** Code devise ISO 4217 (ex: 'XAF') */
  currency: string;
}

/**
 * Construit le HTML complet d'un document commercial (proforma, facture, avoir)
 * selon l'identité visuelle Bridge Technologies Solutions.
 *
 * Les montants sont formatés en franc CFA (pas de décimales, séparateur d'espace)
 * conformément aux usages SYSCOHADA.
 *
 * @param params - Données du document (voir `DocumentHtmlParams`)
 * @returns Chaîne HTML prête à être passée à `generatePdf()`
 */
export function buildDocumentHtml(params: DocumentHtmlParams): string {
  /** Formateur monétaire : 1500000 → "1 500 000 XAF" */
  const fmt = (n: number) =>
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n) +
    ' ' +
    params.currency;

  const linesHtml = params.lines
    .map(
      (l) => `
      <tr>
        <td>${l.designation}</td>
        <td style="text-align:center">${l.quantity} ${l.unit}</td>
        <td style="text-align:right">${fmt(l.unitPriceHt)}</td>
        <td style="text-align:center">${l.taxRate}%</td>
        <td style="text-align:right">${fmt(l.totalTtc)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1a1a2e; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #1e3a8a; }
  .company-info h1 { font-size: 22px; color: #1e3a8a; margin-bottom: 4px; }
  .doc-title { text-align: right; }
  .doc-title h2 { font-size: 28px; color: #1e3a8a; text-transform: uppercase; }
  .doc-title .number { font-size: 14px; color: #6b7280; margin-top: 4px; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .party { width: 48%; }
  .party h3 { font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; margin-bottom: 8px; }
  .party p { line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: #1e3a8a; color: white; }
  thead th { padding: 10px 8px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
  .totals { float: right; width: 300px; }
  .totals table { width: 100%; }
  .totals td { padding: 6px 8px; }
  .totals tr:last-child { font-weight: bold; background: #1e3a8a; color: white; font-size: 14px; }
  .footer-notes { clear: both; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
  .footer-notes p { color: #6b7280; font-size: 11px; line-height: 1.6; }
  .badge { display: inline-block; padding: 4px 12px; background: #dbeafe; color: #1e3a8a; border-radius: 4px; font-weight: bold; font-size: 11px; margin-bottom: 8px; }
</style>
</head>
<body>
  <div class="header">
    <div class="company-info">
      <h1>${params.companyName}</h1>
      <p>${params.companyAddress}</p>
      <p>Tél : ${params.companyPhone} | Email : ${params.companyEmail}</p>
      ${params.companyTaxNumber ? `<p>NIU : ${params.companyTaxNumber}</p>` : ''}
    </div>
    <div class="doc-title">
      <div class="badge">${params.type}</div>
      <h2>${params.type}</h2>
      <div class="number">N° ${params.number}</div>
      <p>Date : ${params.issueDate}</p>
      ${params.dueDate     ? `<p>Échéance : ${params.dueDate}</p>`            : ''}
      ${params.validUntil  ? `<p>Valide jusqu\'au : ${params.validUntil}</p>` : ''}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Émetteur</h3>
      <p><strong>${params.companyName}</strong></p>
      <p>${params.companyAddress}</p>
    </div>
    <div class="party">
      <h3>Client</h3>
      <p><strong>${params.clientName}</strong></p>
      ${params.clientAddress   ? `<p>${params.clientAddress}</p>`   : ''}
      ${params.clientEmail     ? `<p>${params.clientEmail}</p>`     : ''}
      ${params.clientTaxNumber ? `<p>NIU : ${params.clientTaxNumber}</p>` : ''}
    </div>
  </div>

  ${params.subject ? `<p style="margin-bottom:20px"><strong>Objet :</strong> ${params.subject}</p>` : ''}

  <table>
    <thead>
      <tr>
        <th style="width:40%">Désignation</th>
        <th style="width:15%;text-align:center">Qté / Unité</th>
        <th style="width:18%;text-align:right">Prix unitaire HT</th>
        <th style="width:10%;text-align:center">TVA</th>
        <th style="width:17%;text-align:right">Total TTC</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Total HT</td><td style="text-align:right">${fmt(params.subtotalHt)}</td></tr>
      <tr><td>TVA</td><td style="text-align:right">${fmt(params.totalTax)}</td></tr>
      <tr><td>TOTAL TTC</td><td style="text-align:right">${fmt(params.totalTtc)}</td></tr>
    </table>
  </div>

  <div class="footer-notes">
    ${params.paymentConditions ? `<p><strong>Conditions de paiement :</strong> ${params.paymentConditions}</p>` : ''}
    ${params.notes ? `<p style="margin-top:8px"><strong>Notes :</strong> ${params.notes}</p>` : ''}
    <p style="margin-top:16px; font-size:10px; color:#9ca3af">
      Document généré électroniquement — Bridge Technologies Solutions (BTS) — Douala, Cameroun
    </p>
  </div>
</body>
</html>`;
}
