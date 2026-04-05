/**
 * @module modules/reports/reports.routes
 * Routes des rapports financiers.
 *
 * Tous les endpoints acceptent ?format=json (défaut), ?format=csv ou ?format=pdf
 * GET /api/reports/revenue
 * GET /api/reports/by-client
 * GET /api/reports/by-category
 * GET /api/reports/unpaid
 * GET /api/reports/payments
 * GET /api/reports/tax-summary
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { reportsService } from './reports.service';
import { sendCsvResponse } from '../../lib/csv';
import { generatePdf, imgToBase64 } from '../../lib/pdf';
import { prisma } from '../../config/database';
import { authenticate } from '../../core/middleware/auth';
import { authorize } from '../../core/middleware/rbac';

export const reportsRouter: ReturnType<typeof Router> = Router();

reportsRouter.use(authenticate, authorize('admin', 'commercial'));

const rangeSchema = z.object({
  dateFrom:  z.coerce.date().optional(),
  dateTo:    z.coerce.date().optional(),
  year:      z.coerce.number().int().min(2000).max(2100).optional(),
  quarter:   z.coerce.number().int().min(1).max(4).optional(),
  format:    z.enum(['json', 'csv', 'pdf']).default('json'),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getReportAssets() {
  const settings = await prisma.companySettings.findFirst({
    select: { companyName: true, headerImagePath: true, footerImagePath: true },
  });
  return {
    companyName:    settings?.companyName    ?? 'Bridge Technologies Solutions',
    headerImageB64: settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined,
    footerImageB64: settings?.footerImagePath ? imgToBase64(settings.footerImagePath) : undefined,
  };
}

/** Formate un montant XAF sans décimales */
function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' XAF';
}

/** Libellé de période humain */
function periodLabel(range: { year?: number; quarter?: number; dateFrom?: Date; dateTo?: Date }): string {
  if (range.dateFrom && range.dateTo) {
    return `Du ${range.dateFrom.toLocaleDateString('fr-FR')} au ${range.dateTo.toLocaleDateString('fr-FR')}`;
  }
  const year = range.year ?? new Date().getFullYear();
  if (range.quarter) return `${year} \u2014 Trimestre ${range.quarter}`;
  return `Ann\u00e9e ${year}`;
}

/** Jours de retard depuis une date d'échéance */
function daysLate(dueDate: Date | string): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000);
}

/** Ligne vide centrée quand un tableau n'a aucune donnée */
function emptyRow(cols: number, message = 'Aucune donnée pour cette période'): string {
  return `<tr><td colspan="${cols}" style="text-align:center;color:#94a3b8;font-style:italic;padding:20px 0">${message}</td></tr>`;
}

// ─── CSS commun ────────────────────────────────────────────────────────────────

const REPORT_CSS = `
  /* ── Reset ── */
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  /* ── Base — Helvetica Neue proche d'IBM Plex Sans (fintech/corporate) ── */
  html, body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5px;
    line-height: 1.5;
    color: #1e293b;
    width: 210mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Print ── */
  @page { margin: 0; size: A4 portrait; }
  @media print {
    .no-print { display: none !important; }
    table      { page-break-inside: auto; }
    tr         { page-break-inside: avoid; page-break-after: auto; }
    thead      { display: table-header-group; }
    tfoot      { display: table-footer-group; }
    .section-block { page-break-inside: avoid; }
  }

  /* ── Header / footer images (injectés par generatePdf) ── */
  .page-header img, .page-footer img { width: 100%; display: block; }

  /* ── Contenu principal ── */
  .page-content { padding: 6mm 15mm 10mm; }

  /* ── En-tête du rapport ──
     Swiss Modernism 2.0 : ligne navy 3px, hiérarchie typographique nette */
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 18px;
    padding-bottom: 12px;
    border-bottom: 3px solid #0f2d4a;
  }
  .report-header-left { display: flex; flex-direction: column; gap: 4px; }
  .report-badge {
    display: inline-block;
    padding: 2px 8px;
    background: #0f2d4a;
    color: #fff;
    font-size: 7.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    border-radius: 3px;
    width: fit-content;
    margin-bottom: 3px;
  }
  .report-title {
    font-size: 17px;
    font-weight: 800;
    color: #0f2d4a;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }
  .report-period {
    font-size: 10.5px;
    color: #475569;
    font-weight: 500;
    margin-top: 2px;
  }
  .report-header-right { text-align: right; flex-shrink: 0; }
  .company-name  { font-size: 12px; font-weight: 800; color: #0f2d4a; }
  .report-generated { font-size: 8.5px; color: #94a3b8; margin-top: 4px; }
  .report-ref    { font-size: 8px; color: #cbd5e1; font-family: 'Courier New', monospace; margin-top: 2px; }

  /* ── KPI strip (Swiss : accent left-border, fond sobre) ── */
  .kpis { display: flex; gap: 8px; margin-bottom: 16px; }
  .kpi  {
    flex: 1;
    padding: 10px 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 3px solid #0f2d4a;
    border-radius: 3px;
  }
  .kpi-label {
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
    margin-bottom: 5px;
  }
  .kpi-value {
    font-size: 14px;
    font-weight: 800;
    color: #0f2d4a;
    font-family: 'Courier New', monospace;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .kpi-value.blue   { color: #2D7DD2; }
  .kpi-value.purple { color: #7c3aed; border-left-color: #7c3aed; }
  .kpi-value.green  { color: #059669; }
  .kpi-value.red    { color: #dc2626; }
  .kpi-value.orange { color: #d97706; }
  .kpi.accent-blue   { border-left-color: #2D7DD2; }
  .kpi.accent-purple { border-left-color: #7c3aed; }
  .kpi.accent-green  { border-left-color: #059669; }
  .kpi.accent-red    { border-left-color: #dc2626; }

  /* ── Label de section ── */
  .section-label {
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #94a3b8;
    margin-bottom: 8px;
    padding-bottom: 5px;
    border-bottom: 1px solid #f1f5f9;
  }

  /* ── Bannière alerte ── */
  .alert-banner {
    padding: 10px 14px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-left: 4px solid #dc2626;
    border-radius: 3px;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .alert-left   { display: flex; align-items: center; gap: 8px; }
  .alert-icon   {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px; height: 18px;
    background: #dc2626;
    color: #fff;
    border-radius: 50%;
    font-size: 10px;
    font-weight: 900;
    flex-shrink: 0;
    line-height: 1;
  }
  .alert-text   { font-size: 11px; font-weight: 700; color: #b91c1c; }
  .alert-amount { font-size: 13px; font-weight: 800; color: #b91c1c; font-family: 'Courier New', monospace; white-space: nowrap; }

  /* ── Encadré info (SYSCOHADA, notes) ── */
  .info-box {
    padding: 8px 12px;
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-left: 3px solid #0284c7;
    border-radius: 3px;
    margin-bottom: 14px;
    font-size: 10px;
    color: #0369a1;
    line-height: 1.5;
  }
  .info-box strong { font-weight: 700; }

  /* ── Tables ──
     Header navy (Swiss Modernism : fond foncé, texte blanc)
     Zébrure légère, total en tfoot avec bordure navy */
  table  { width: 100%; border-collapse: collapse; }
  thead  { display: table-header-group; }
  tfoot  { display: table-footer-group; }

  thead tr { background: #0f2d4a; }
  th {
    padding: 8px 9px;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #fff;
    text-align: left;
    white-space: nowrap;
    border: none;
  }
  th.r { text-align: right; }

  td {
    padding: 8.5px 9px;
    font-size: 10.5px;
    color: #334155;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
    background: transparent;
  }
  td.r    { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; font-variant-numeric: tabular-nums; }
  td.bold { font-weight: 700; }
  td.blue   { color: #2D7DD2; font-weight: 600; }
  td.purple { color: #7c3aed; font-weight: 700; }
  td.green  { color: #059669; font-weight: 600; }
  td.red    { color: #dc2626; font-weight: 700; }
  td.mono   { font-family: 'Courier New', monospace; font-size: 10px; }
  td.muted  { color: #94a3b8; font-size: 9.5px; }
  td.rank   { color: #cbd5e1; font-size: 9.5px; font-family: 'Courier New', monospace; width: 24px; }

  /* Zébrure semi-transparente */
  tbody tr:nth-child(even) td { background: rgba(248,250,252,0.8); }

  /* Ligne de total (tfoot) */
  tfoot tr td {
    background: #f1f5f9 !important;
    font-weight: 800;
    color: #0f2d4a;
    font-size: 11px;
    border-top: 2px solid #0f2d4a;
    border-bottom: none;
  }

  /* ── Badges statut ── */
  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .badge-warning { background: rgba(245,158,11,0.1); color: #b45309; border-color: rgba(245,158,11,0.3); }
  .badge-error   { background: rgba(239,68,68,0.1);  color: #b91c1c; border-color: rgba(239,68,68,0.3); }
  .badge-success { background: rgba(16,185,129,0.1); color: #065f46; border-color: rgba(16,185,129,0.3); }
  .badge-neutral { background: rgba(100,116,139,0.1); color: #475569; border-color: rgba(100,116,139,0.2); }

  /* ── Barre de progression (By-Category) ── */
  .progress-wrap { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
  .progress-bg   { width: 50px; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; flex-shrink: 0; }
  .progress-fill { height: 100%; background: #2D7DD2; border-radius: 3px; }
  .progress-pct  { font-family: 'Courier New', monospace; font-size: 10px; color: #475569; min-width: 30px; text-align: right; }

  /* ── Retard pill (Impayés) ── */
  .late-pill {
    display: inline-block;
    padding: 2px 6px;
    background: rgba(239,68,68,0.1);
    color: #b91c1c;
    border: 1px solid rgba(239,68,68,0.25);
    border-radius: 10px;
    font-size: 9px;
    font-weight: 700;
    font-family: 'Courier New', monospace;
    white-space: nowrap;
  }

  /* ── Pied de rapport ── */
  .report-footer {
    margin-top: 22px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }
  .report-footer-note {
    font-size: 8.5px;
    color: #94a3b8;
    line-height: 1.5;
    max-width: 75%;
  }
  .report-footer-brand {
    font-size: 8px;
    color: #cbd5e1;
    text-align: right;
    white-space: nowrap;
  }
`;

// ─── Shell HTML commun ─────────────────────────────────────────────────────────

/**
 * Génère le HTML complet d'un rapport PDF.
 * Le badge `reportType` apparaît au-dessus du titre (Swiss Modernism 2.0).
 * Les blocs .page-header / .page-footer sont détectés par generatePdf().
 */
function reportHtml(opts: {
  title:          string;
  subtitle:       string;
  reportType:     string;
  body:           string;
  footerNote?:    string;
  companyName?:   string;
  headerImageB64?: string;
  footerImageB64?: string;
}): string {
  const {
    title, subtitle, reportType, body,
    footerNote = '',
    companyName = 'Bridge Technologies Solutions',
    headerImageB64, footerImageB64,
  } = opts;

  const now     = new Date();
  const genDate = now.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
  const genTime = now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  const refId   = `RPT-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width"/>
<style>${REPORT_CSS}</style>
</head>
<body>

  <!-- Header image -->
  <div class="page-header">
    ${headerImageB64 ? `<img src="${headerImageB64}" alt=""/>` : ''}
  </div>

  <!-- Footer image (fond de page injecté par pdf-lib) -->
  <div class="page-footer">
    ${footerImageB64 ? `<img src="${footerImageB64}" alt=""/>` : ''}
  </div>

  <div class="page-content">

    <!-- En-tête du rapport -->
    <div class="report-header">
      <div class="report-header-left">
        <span class="report-badge">${reportType}</span>
        <h1 class="report-title">${title}</h1>
        <div class="report-period">${subtitle}</div>
      </div>
      <div class="report-header-right">
        ${headerImageB64 ? '' : `<div class="company-name">${companyName}</div>`}
        <div class="report-generated">G\u00e9n\u00e9r\u00e9 le ${genDate} \u00e0 ${genTime}</div>
        <div class="report-ref">${refId}</div>
      </div>
    </div>

    <!-- Corps du rapport -->
    ${body}

    <!-- Pied de rapport -->
    <div class="report-footer">
      <div class="report-footer-note">
        ${footerNote || `Document \u00e9tabli par ${companyName} \u2014 Douala, Cameroun.
        Confidentialit\u00e9 : usage interne uniquement.`}
      </div>
      <div class="report-footer-brand">
        InvoiceHub v2.0<br/>
        SYSCOHADA r\u00e9vis\u00e9
      </div>
    </div>

  </div>
</body>
</html>`;
}

/** Envoie un buffer PDF comme pièce jointe */
function sendPdfResponse(res: Response, filename: string, buffer: Buffer) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

// ─── Route : Chiffre d'affaires mensuel ───────────────────────────────────────

reportsRouter.get('/revenue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, ...range } = rangeSchema.parse(req.query);
    const data = await reportsService.getRevenue(range);

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-ca-mensuel.csv',
        ['Mois', 'Total HT', 'TVA', 'Total TTC', 'Nb Factures'],
        data.map(r => [r.month, r.totalHt, r.totalTax, r.totalTtc, r.count]),
      );
    }

    if (format === 'pdf') {
      const assets   = await getReportAssets();
      const totalHt  = data.reduce((s, r) => s + r.totalHt,  0);
      const totalTax = data.reduce((s, r) => s + r.totalTax, 0);
      const totalTtc = data.reduce((s, r) => s + r.totalTtc, 0);
      const count    = data.reduce((s, r) => s + r.count,    0);

      const MONTHS: Record<string, string> = {
        '01':'Janvier','02':'Février','03':'Mars','04':'Avril',
        '05':'Mai','06':'Juin','07':'Juillet','08':'Août',
        '09':'Septembre','10':'Octobre','11':'Novembre','12':'Décembre',
      };

      const body = `
        <div class="kpis">
          <div class="kpi accent-blue">
            <div class="kpi-label">Chiffre d'affaires HT</div>
            <div class="kpi-value blue">${fmt(totalHt)}</div>
          </div>
          <div class="kpi accent-purple">
            <div class="kpi-label">TVA collectée (19,25%)</div>
            <div class="kpi-value purple">${fmt(totalTax)}</div>
          </div>
          <div class="kpi accent-blue">
            <div class="kpi-label">Total TTC facturé</div>
            <div class="kpi-value blue">${fmt(totalTtc)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Factures émises</div>
            <div class="kpi-value">${count}</div>
          </div>
        </div>

        <div class="section-block">
          <div class="section-label">Détail mensuel</div>
          <table>
            <thead><tr>
              <th>Mois</th>
              <th class="r">Total HT</th>
              <th class="r">TVA (19,25%)</th>
              <th class="r">Total TTC</th>
              <th class="r">Factures</th>
            </tr></thead>
            <tbody>
              ${data.length === 0 ? emptyRow(5) : data.map(r => `<tr>
                <td><strong>${MONTHS[r.month.slice(5)] ?? r.month.slice(5)}</strong> ${r.month.slice(0,4)}</td>
                <td class="r">${fmt(r.totalHt)}</td>
                <td class="r purple">${fmt(r.totalTax)}</td>
                <td class="r bold">${fmt(r.totalTtc)}</td>
                <td class="r">${r.count}</td>
              </tr>`).join('')}
            </tbody>
            <tfoot><tr>
              <td>Total période</td>
              <td class="r">${fmt(totalHt)}</td>
              <td class="r">${fmt(totalTax)}</td>
              <td class="r">${fmt(totalTtc)}</td>
              <td class="r">${count}</td>
            </tr></tfoot>
          </table>
        </div>`;

      const html = reportHtml({
        reportType:    'Rapport financier',
        title:         "Chiffre d'affaires mensuel",
        subtitle:      periodLabel(range),
        body,
        ...assets,
      });
      return sendPdfResponse(res, 'rapport-ca-mensuel.pdf', await generatePdf(html));
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ─── Route : CA par client ────────────────────────────────────────────────────

reportsRouter.get('/by-client', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, ...range } = rangeSchema.parse(req.query);
    const data = await reportsService.getRevenueByClient(range);

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-ca-clients.csv',
        ['Client', 'Email', 'Total HT', 'TVA', 'Total TTC', 'Payé', 'Solde dû', 'Nb Factures'],
        data.map(r => [r.client.name, r.client.email, r.totalHt, r.totalTax, r.totalTtc, r.amountPaid, r.balanceDue, r.invoiceCount]),
      );
    }

    if (format === 'pdf') {
      const assets    = await getReportAssets();
      const totalHt   = data.reduce((s, r) => s + r.totalHt,    0);
      const totalTtc  = data.reduce((s, r) => s + r.totalTtc,   0);
      const totalPaid = data.reduce((s, r) => s + r.amountPaid, 0);
      const totalDue  = data.reduce((s, r) => s + r.balanceDue, 0);
      const totalCnt  = data.reduce((s, r) => s + r.invoiceCount, 0);

      const body = `
        <div class="kpis">
          <div class="kpi accent-blue">
            <div class="kpi-label">CA Total TTC</div>
            <div class="kpi-value blue">${fmt(totalTtc)}</div>
          </div>
          <div class="kpi accent-green">
            <div class="kpi-label">Montant encaissé</div>
            <div class="kpi-value green">${fmt(totalPaid)}</div>
          </div>
          <div class="kpi ${totalDue > 0 ? 'accent-red' : ''}">
            <div class="kpi-label">Solde dû</div>
            <div class="kpi-value ${totalDue > 0 ? 'red' : ''}">${fmt(totalDue)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Clients actifs</div>
            <div class="kpi-value">${data.length}</div>
          </div>
        </div>

        <div class="section-block">
          <div class="section-label">Répartition par client — trié par CA décroissant</div>
          <table>
            <thead><tr>
              <th style="width:20px">#</th>
              <th>Client</th>
              <th class="r">Total HT</th>
              <th class="r">Total TTC</th>
              <th class="r">Encaissé</th>
              <th class="r">Solde dû</th>
              <th class="r">Factures</th>
            </tr></thead>
            <tbody>
              ${data.length === 0 ? emptyRow(7) : data.map((r, i) => `<tr>
                <td class="rank">${i + 1}</td>
                <td>
                  <strong>${r.client.name}</strong>
                  ${r.client.email ? `<br/><span style="font-size:9px;color:#94a3b8">${r.client.email}</span>` : ''}
                </td>
                <td class="r">${fmt(r.totalHt)}</td>
                <td class="r bold">${fmt(r.totalTtc)}</td>
                <td class="r green">${fmt(r.amountPaid)}</td>
                <td class="r ${r.balanceDue > 0 ? 'red' : 'muted'}">${fmt(r.balanceDue)}</td>
                <td class="r">${r.invoiceCount}</td>
              </tr>`).join('')}
            </tbody>
            <tfoot><tr>
              <td colspan="2">Total</td>
              <td class="r">${fmt(totalHt)}</td>
              <td class="r">${fmt(totalTtc)}</td>
              <td class="r">${fmt(totalPaid)}</td>
              <td class="r">${fmt(totalDue)}</td>
              <td class="r">${totalCnt}</td>
            </tr></tfoot>
          </table>
        </div>`;

      const html = reportHtml({
        reportType: 'Rapport financier',
        title:      'Chiffre d\'affaires par client',
        subtitle:   periodLabel(range),
        body,
        ...assets,
      });
      return sendPdfResponse(res, 'rapport-ca-clients.pdf', await generatePdf(html));
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ─── Route : CA par catégorie ─────────────────────────────────────────────────

reportsRouter.get('/by-category', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, ...range } = rangeSchema.parse(req.query);
    const data = await reportsService.getRevenueByCategory(range);

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-ca-categories.csv',
        ['Catégorie', 'Total HT', 'Total TTC', 'Nb Factures'],
        data.map(r => [r.category, r.totalHt, r.totalTtc, r.invoiceCount]),
      );
    }

    if (format === 'pdf') {
      const assets   = await getReportAssets();
      const totalHt  = data.reduce((s, r) => s + r.totalHt,      0);
      const totalTtc = data.reduce((s, r) => s + r.totalTtc,     0);
      const totalCnt = data.reduce((s, r) => s + r.invoiceCount, 0);

      const body = `
        <div class="kpis">
          <div class="kpi accent-blue">
            <div class="kpi-label">CA HT total</div>
            <div class="kpi-value blue">${fmt(totalHt)}</div>
          </div>
          <div class="kpi accent-blue">
            <div class="kpi-label">CA TTC total</div>
            <div class="kpi-value blue">${fmt(totalTtc)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Catégories actives</div>
            <div class="kpi-value">${data.length}</div>
          </div>
        </div>

        <div class="section-block">
          <div class="section-label">Répartition du chiffre d'affaires</div>
          <table>
            <thead><tr>
              <th>Catégorie</th>
              <th class="r">Total HT</th>
              <th class="r">Total TTC</th>
              <th class="r">Part du CA</th>
              <th class="r">Factures</th>
            </tr></thead>
            <tbody>
              ${data.length === 0 ? emptyRow(5) : data.map(r => {
                const pct = totalHt > 0 ? Math.round(r.totalHt / totalHt * 100) : 0;
                const bar = Math.max(1, pct);
                return `<tr>
                  <td><strong>${r.category}</strong></td>
                  <td class="r">${fmt(r.totalHt)}</td>
                  <td class="r bold">${fmt(r.totalTtc)}</td>
                  <td class="r">
                    <div class="progress-wrap">
                      <div class="progress-bg">
                        <div class="progress-fill" style="width:${bar}%"></div>
                      </div>
                      <span class="progress-pct">${pct}%</span>
                    </div>
                  </td>
                  <td class="r">${r.invoiceCount}</td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot><tr>
              <td>Total</td>
              <td class="r">${fmt(totalHt)}</td>
              <td class="r">${fmt(totalTtc)}</td>
              <td class="r">100%</td>
              <td class="r">${totalCnt}</td>
            </tr></tfoot>
          </table>
        </div>`;

      const html = reportHtml({
        reportType: 'Rapport financier',
        title:      'Chiffre d\'affaires par catégorie',
        subtitle:   periodLabel(range),
        body,
        ...assets,
      });
      return sendPdfResponse(res, 'rapport-ca-categories.pdf', await generatePdf(html));
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ─── Route : Factures impayées ────────────────────────────────────────────────

reportsRouter.get('/unpaid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format } = rangeSchema.parse(req.query);
    const data = await reportsService.getUnpaid();

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-impayes.csv',
        ['Numéro', 'Client', 'Email', 'Date émission', 'Échéance', 'Retard (jours)', 'Total TTC', 'Solde dû', 'Statut'],
        data.map(r => {
          const late = new Date(r.dueDate) < new Date();
          return [
            r.number, r.client.name, r.client.email,
            r.issueDate.toISOString().slice(0, 10),
            r.dueDate.toISOString().slice(0, 10),
            late ? daysLate(r.dueDate) : 0,
            Number(r.totalTtc), Number(r.balanceDue), r.status,
          ];
        }),
      );
    }

    if (format === 'pdf') {
      const assets   = await getReportAssets();
      const totalDue = data.reduce((s, r) => s + Number(r.balanceDue), 0);
      const now      = new Date();

      const STATUS_FR: Record<string, string> = {
        issued:          'Émise',
        partially_paid:  'Part. payée',
        overdue:         'En retard',
      };

      const body = `
        ${data.length > 0 ? `
        <div class="alert-banner">
          <div class="alert-left">
            <span class="alert-icon">!</span>
            <span class="alert-text">
              ${data.length} facture${data.length > 1 ? 's' : ''} impayée${data.length > 1 ? 's' : ''}
              au ${now.toLocaleDateString('fr-FR')}
            </span>
          </div>
          <span class="alert-amount">${fmt(totalDue)}</span>
        </div>` : ''}

        <div class="section-block">
          <div class="section-label">Détail des impayés — trié par retard décroissant</div>
          <table>
            <thead><tr>
              <th>Numéro</th>
              <th>Client</th>
              <th>Émission</th>
              <th>Échéance</th>
              <th class="r">Retard</th>
              <th class="r">Total TTC</th>
              <th class="r">Solde dû</th>
              <th>Statut</th>
            </tr></thead>
            <tbody>
              ${data.length === 0
                ? emptyRow(8, 'Aucune facture impayée — situation saine')
                : data.map(r => {
                const late = new Date(r.dueDate) < now;
                const days = late ? daysLate(r.dueDate) : 0;
                return `<tr>
                  <td class="mono blue">${r.number}</td>
                  <td><strong>${r.client.name}</strong></td>
                  <td class="muted">${new Date(r.issueDate).toLocaleDateString('fr-FR')}</td>
                  <td style="${late ? 'color:#b91c1c;font-weight:600' : ''}">${new Date(r.dueDate).toLocaleDateString('fr-FR')}</td>
                  <td class="r">
                    ${late
                      ? `<span class="late-pill">J+${days}</span>`
                      : `<span class="muted">—</span>`}
                  </td>
                  <td class="r">${fmt(Number(r.totalTtc))}</td>
                  <td class="r red bold">${fmt(Number(r.balanceDue))}</td>
                  <td><span class="badge ${r.status === 'overdue' ? 'badge-error' : 'badge-warning'}">${STATUS_FR[r.status] ?? r.status}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot><tr>
              <td colspan="6">Total impayé</td>
              <td class="r">${fmt(totalDue)}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>`;

      const html = reportHtml({
        reportType:  'Rapport de recouvrement',
        title:       'Factures impayées',
        subtitle:    `Situation au ${now.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}`,
        body,
        footerNote:  'Ce rapport liste l\'ensemble des factures dont le solde est supérieur à zéro. ' +
                     'À utiliser pour le suivi des relances et actions de recouvrement.',
        ...assets,
      });
      return sendPdfResponse(res, 'rapport-impayes.pdf', await generatePdf(html));
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ─── Route : Journal des encaissements ───────────────────────────────────────

reportsRouter.get('/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, ...range } = rangeSchema.parse(req.query);
    const data = await reportsService.getPayments(range);

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-encaissements.csv',
        ['Date', 'Facture', 'Client', 'Méthode', 'Montant', 'Référence'],
        data.map(r => [
          r.paymentDate.toISOString().slice(0, 10),
          r.invoice.number, r.invoice.client.name,
          r.method, Number(r.amount), r.reference ?? '',
        ]),
      );
    }

    if (format === 'pdf') {
      const assets = await getReportAssets();
      const total  = data.reduce((s, r) => s + Number(r.amount), 0);

      const METHOD_FR: Record<string, string> = {
        cash:          'Espèces',
        bank_transfer: 'Virement',
        check:         'Chèque',
        mobile_money:  'Mobile Money',
        card:          'Carte',
      };

      // Répartition par mode de paiement
      const byMethod: Record<string, number> = {};
      for (const r of data) {
        byMethod[r.method] = (byMethod[r.method] ?? 0) + Number(r.amount);
      }

      const body = `
        <div class="kpis">
          <div class="kpi accent-green">
            <div class="kpi-label">Total encaissé</div>
            <div class="kpi-value green">${fmt(total)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Nb encaissements</div>
            <div class="kpi-value">${data.length}</div>
          </div>
          ${Object.entries(byMethod).slice(0, 2).map(([method, amount]) => `
          <div class="kpi">
            <div class="kpi-label">${METHOD_FR[method] ?? method}</div>
            <div class="kpi-value">${fmt(amount)}</div>
          </div>`).join('')}
        </div>

        <div class="section-block">
          <div class="section-label">Journal chronologique des encaissements</div>
          <table>
            <thead><tr>
              <th>Date</th>
              <th>Facture</th>
              <th>Client</th>
              <th>Mode</th>
              <th>Référence</th>
              <th class="r">Montant</th>
            </tr></thead>
            <tbody>
              ${data.length === 0 ? emptyRow(6) : data.map(r => `<tr>
                <td class="muted">${new Date(r.paymentDate).toLocaleDateString('fr-FR')}</td>
                <td class="mono blue">${r.invoice.number}</td>
                <td>${r.invoice.client.name}</td>
                <td>${METHOD_FR[r.method] ?? r.method}</td>
                <td class="muted mono">${r.reference ?? '—'}</td>
                <td class="r green bold">+${fmt(Number(r.amount))}</td>
              </tr>`).join('')}
            </tbody>
            <tfoot><tr>
              <td colspan="5">Total encaissé</td>
              <td class="r">${fmt(total)}</td>
            </tr></tfoot>
          </table>
        </div>`;

      const html = reportHtml({
        reportType: 'Journal comptable',
        title:      'Journal des encaissements',
        subtitle:   periodLabel(range),
        body,
        ...assets,
      });
      return sendPdfResponse(res, 'rapport-encaissements.pdf', await generatePdf(html));
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ─── Route : Récapitulatif TVA ────────────────────────────────────────────────

reportsRouter.get('/tax-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format, ...range } = rangeSchema.parse(req.query);
    const data = await reportsService.getTaxSummary(range);

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-tva.csv',
        ['Période', 'Base HT', 'TVA collectée', 'Total TTC', 'Nb Factures'],
        data.map(r => [r.period, r.totalHt, r.totalTax, r.totalTtc, r.count]),
      );
    }

    if (format === 'pdf') {
      const assets   = await getReportAssets();
      const totalHt  = data.reduce((s, r) => s + r.totalHt,  0);
      const totalTax = data.reduce((s, r) => s + r.totalTax, 0);
      const totalTtc = data.reduce((s, r) => s + r.totalTtc, 0);
      const totalCnt = data.reduce((s, r) => s + r.count,    0);

      // Taux effectif moyen
      const effectiveRate = totalHt > 0
        ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            .format((totalTax / totalHt) * 100)
        : '0,00';

      const body = `
        <div class="kpis">
          <div class="kpi accent-blue">
            <div class="kpi-label">Base HT totale</div>
            <div class="kpi-value blue">${fmt(totalHt)}</div>
          </div>
          <div class="kpi accent-purple">
            <div class="kpi-label">TVA collectée</div>
            <div class="kpi-value purple">${fmt(totalTax)}</div>
          </div>
          <div class="kpi accent-blue">
            <div class="kpi-label">Total TTC</div>
            <div class="kpi-value blue">${fmt(totalTtc)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Taux effectif moyen</div>
            <div class="kpi-value">${effectiveRate}%</div>
          </div>
        </div>

        <div class="info-box">
          <strong>Taux TVA applicable : 19,25%</strong> — Conformément au Code Général des Impôts du Cameroun
          et aux règles SYSCOHADA révisé. Ce rapport constitue un justificatif pour les déclarations
          fiscales mensuelles (DGI Cameroun).
        </div>

        <div class="section-block">
          <div class="section-label">Détail par période</div>
          <table>
            <thead><tr>
              <th>Période</th>
              <th class="r">Base imposable HT</th>
              <th class="r">TVA collectée (19,25%)</th>
              <th class="r">Total TTC</th>
              <th class="r">Factures</th>
            </tr></thead>
            <tbody>
              ${data.length === 0 ? emptyRow(5) : data.map(r => `<tr>
                <td class="mono bold">${r.period}</td>
                <td class="r">${fmt(r.totalHt)}</td>
                <td class="r purple bold">${fmt(r.totalTax)}</td>
                <td class="r">${fmt(r.totalTtc)}</td>
                <td class="r">${r.count}</td>
              </tr>`).join('')}
            </tbody>
            <tfoot><tr>
              <td>Total</td>
              <td class="r">${fmt(totalHt)}</td>
              <td class="r">${fmt(totalTax)}</td>
              <td class="r">${fmt(totalTtc)}</td>
              <td class="r">${totalCnt}</td>
            </tr></tfoot>
          </table>
        </div>`;

      const html = reportHtml({
        reportType:  'Déclaration fiscale',
        title:       'Récapitulatif TVA',
        subtitle:    periodLabel(range),
        body,
        footerNote:  'Document établi conformément au Code Général des Impôts du Cameroun (CGI) et ' +
                     'aux règles SYSCOHADA révisé. Taux TVA : 19,25%. ' +
                     'À conserver pour les déclarations fiscales DGI — Direction des Impôts de Douala.',
        ...assets,
      });
      return sendPdfResponse(res, 'rapport-tva.pdf', await generatePdf(html));
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});
