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

// ─── Helpers PDF ──────────────────────────────────────────────────────────────

/** Charge le logo et le nom de l'entreprise depuis les paramètres société */
async function getReportAssets() {
  const settings = await prisma.companySettings.findFirst({
    select: { companyName: true, headerImagePath: true },
  });
  const companyName = settings?.companyName ?? 'Bridge Technologies Solutions';
  const logoB64     = settings?.headerImagePath ? imgToBase64(settings.headerImagePath) : undefined;
  return { companyName, logoB64 };
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' XAF';
}

function periodLabel(range: { year?: number; quarter?: number; dateFrom?: Date; dateTo?: Date }): string {
  if (range.dateFrom && range.dateTo) {
    return `Du ${range.dateFrom.toLocaleDateString('fr-FR')} au ${range.dateTo.toLocaleDateString('fr-FR')}`;
  }
  const year = range.year ?? new Date().getFullYear();
  if (range.quarter) return `${year} — Trimestre ${range.quarter}`;
  return `Année ${year}`;
}

/** Wraps a content HTML block in the common report page shell */
function reportHtml(title: string, subtitle: string, body: string, companyName = 'Bridge Technologies Solutions', logoB64?: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; font-size: 12px; }
  .page { padding: 32px 40px; }

  /* Header */
  .report-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 2px solid #0f2d4a; }
  .company-name  { font-size: 18px; font-weight: 800; color: #0f2d4a; letter-spacing: -0.02em; }
  .company-sub   { font-size: 10px; color: #64748b; margin-top: 2px; }
  .report-title  { text-align: right; }
  .report-title h1 { font-size: 16px; font-weight: 800; color: #0f2d4a; letter-spacing: -0.01em; }
  .report-title .period { font-size: 11px; color: #64748b; margin-top: 3px; }
  .report-title .generated { font-size: 10px; color: #94a3b8; margin-top: 2px; }

  /* KPI strip */
  .kpis { display: flex; gap: 12px; margin-bottom: 22px; }
  .kpi  { flex: 1; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
  .kpi-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 5px; }
  .kpi-value { font-size: 15px; font-weight: 800; color: #0f2d4a; font-variant-numeric: tabular-nums; }
  .kpi-value.blue   { color: #2D7DD2; }
  .kpi-value.purple { color: #7c3aed; }
  .kpi-value.green  { color: #059669; }
  .kpi-value.red    { color: #dc2626; }

  /* Alert banner */
  .alert-banner { padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
  .alert-banner span { font-size: 12px; font-weight: 600; color: #dc2626; }

  /* Table */
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #f1f5f9; }
  th { padding: 8px 10px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; border-bottom: 2px solid #e2e8f0; text-align: left; white-space: nowrap; }
  th.r { text-align: right; }
  td { padding: 9px 10px; font-size: 11.5px; color: #334155; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.bold { font-weight: 700; }
  td.blue   { color: #2D7DD2; font-weight: 600; }
  td.purple { color: #7c3aed; font-weight: 700; }
  td.green  { color: #059669; font-weight: 600; }
  td.red    { color: #dc2626; font-weight: 700; }
  td.mono   { font-family: 'Courier New', monospace; font-size: 11px; }
  tr:nth-child(even) td { background: #fafbfc; }

  /* Total row */
  .total-row td { background: #f1f5f9 !important; font-weight: 700; border-top: 2px solid #e2e8f0; font-size: 12px; }

  /* Footer */
  .report-footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
  .report-footer p { font-size: 9px; color: #94a3b8; }

  /* Status badge */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
  .badge-warning { background: rgba(245,158,11,0.1); color: #d97706; }
  .badge-error   { background: rgba(239,68,68,0.1); color: #dc2626; }
</style>
</head>
<body>
<div class="page">

  <div class="report-header">
    <div>
      ${logoB64
        ? `<img src="${logoB64}" alt="${companyName}" style="height:56px;max-width:220px;object-fit:contain;display:block;margin-bottom:4px" />`
        : `<div class="company-name">${companyName}</div>`
      }
      <div class="company-sub">Plateforme de facturation SYSCOHADA</div>
    </div>
    <div class="report-title">
      <h1>${title}</h1>
      <div class="period">${subtitle}</div>
      <div class="generated">Généré le ${new Date().toLocaleString('fr-FR')}</div>
    </div>
  </div>

  ${body}

  <div class="report-footer">
    <p>${companyName} — Document généré automatiquement par InvoiceHub v2</p>
    <p>Page 1</p>
  </div>

</div>
</body>
</html>`;
}

/** Send a PDF buffer as a downloadable attachment */
function sendPdfResponse(res: Response, filename: string, buffer: Buffer) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

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
      const { companyName, logoB64 } = await getReportAssets();
      const totalHt  = data.reduce((s, r) => s + r.totalHt, 0);
      const totalTax = data.reduce((s, r) => s + r.totalTax, 0);
      const totalTtc = data.reduce((s, r) => s + r.totalTtc, 0);
      const count    = data.reduce((s, r) => s + r.count, 0);
      const MONTHS: Record<string, string> = { '01':'Janvier','02':'Février','03':'Mars','04':'Avril','05':'Mai','06':'Juin','07':'Juillet','08':'Août','09':'Septembre','10':'Octobre','11':'Novembre','12':'Décembre' };
      const body = `
        <div class="kpis">
          <div class="kpi"><div class="kpi-label">Total HT</div><div class="kpi-value blue">${fmt(totalHt)}</div></div>
          <div class="kpi"><div class="kpi-label">TVA collectée</div><div class="kpi-value purple">${fmt(totalTax)}</div></div>
          <div class="kpi"><div class="kpi-label">Total TTC</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div>
          <div class="kpi"><div class="kpi-label">Nb factures</div><div class="kpi-value">${count}</div></div>
        </div>
        <table>
          <thead><tr>
            <th>Mois</th>
            <th class="r">Total HT</th>
            <th class="r">TVA</th>
            <th class="r">Total TTC</th>
            <th class="r">Factures</th>
          </tr></thead>
          <tbody>
            ${data.map(r => `<tr>
              <td>${(MONTHS[r.month.slice(5)] ?? r.month.slice(5))} ${r.month.slice(0,4)}</td>
              <td class="r">${fmt(r.totalHt)}</td>
              <td class="r" style="color:#7c3aed">${fmt(r.totalTax)}</td>
              <td class="r bold">${fmt(r.totalTtc)}</td>
              <td class="r">${r.count}</td>
            </tr>`).join('')}
            <tr class="total-row">
              <td>Total</td>
              <td class="r">${fmt(totalHt)}</td>
              <td class="r" style="color:#7c3aed">${fmt(totalTax)}</td>
              <td class="r">${fmt(totalTtc)}</td>
              <td class="r">${count}</td>
            </tr>
          </tbody>
        </table>`;
      const html = reportHtml("Rapport — Chiffre d'affaires mensuel", periodLabel(range), body, companyName, logoB64);
      const pdf  = await generatePdf(html);
      return sendPdfResponse(res, 'rapport-ca-mensuel.pdf', pdf);
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

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
      const { companyName, logoB64 } = await getReportAssets();
      const totalTtc  = data.reduce((s, r) => s + r.totalTtc, 0);
      const totalPaid = data.reduce((s, r) => s + r.amountPaid, 0);
      const totalDue  = data.reduce((s, r) => s + r.balanceDue, 0);
      const body = `
        <div class="kpis">
          <div class="kpi"><div class="kpi-label">CA Total TTC</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div>
          <div class="kpi"><div class="kpi-label">Encaissé</div><div class="kpi-value green">${fmt(totalPaid)}</div></div>
          <div class="kpi"><div class="kpi-label">Solde dû</div><div class="kpi-value ${totalDue > 0 ? 'red' : ''}">${fmt(totalDue)}</div></div>
          <div class="kpi"><div class="kpi-label">Nb clients</div><div class="kpi-value">${data.length}</div></div>
        </div>
        <table>
          <thead><tr>
            <th>#</th><th>Client</th><th class="r">Total HT</th><th class="r">Total TTC</th>
            <th class="r">Encaissé</th><th class="r">Solde dû</th><th class="r">Factures</th>
          </tr></thead>
          <tbody>
            ${data.map((r, i) => `<tr>
              <td style="color:#94a3b8;font-size:10px">${i + 1}</td>
              <td><strong>${r.client.name}</strong>${r.client.email ? `<br><span style="font-size:10px;color:#94a3b8">${r.client.email}</span>` : ''}</td>
              <td class="r">${fmt(r.totalHt)}</td>
              <td class="r bold">${fmt(r.totalTtc)}</td>
              <td class="r green">${fmt(r.amountPaid)}</td>
              <td class="r ${r.balanceDue > 0 ? 'red' : ''}">${fmt(r.balanceDue)}</td>
              <td class="r">${r.invoiceCount}</td>
            </tr>`).join('')}
            <tr class="total-row">
              <td colspan="2">Total</td>
              <td class="r">${fmt(data.reduce((s,r) => s+r.totalHt, 0))}</td>
              <td class="r">${fmt(totalTtc)}</td>
              <td class="r">${fmt(totalPaid)}</td>
              <td class="r">${fmt(totalDue)}</td>
              <td class="r">${data.reduce((s,r) => s+r.invoiceCount, 0)}</td>
            </tr>
          </tbody>
        </table>`;
      const html = reportHtml("Rapport — CA par client", periodLabel(range), body, companyName, logoB64);
      const pdf  = await generatePdf(html);
      return sendPdfResponse(res, 'rapport-ca-clients.pdf', pdf);
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

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
      const { companyName, logoB64 } = await getReportAssets();
      const totalHt  = data.reduce((s, r) => s + r.totalHt, 0);
      const totalTtc = data.reduce((s, r) => s + r.totalTtc, 0);
      const body = `
        <div class="kpis">
          <div class="kpi"><div class="kpi-label">CA HT total</div><div class="kpi-value blue">${fmt(totalHt)}</div></div>
          <div class="kpi"><div class="kpi-label">CA TTC total</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div>
          <div class="kpi"><div class="kpi-label">Catégories</div><div class="kpi-value">${data.length}</div></div>
        </div>
        <table>
          <thead><tr>
            <th>Catégorie</th><th class="r">Total HT</th><th class="r">Total TTC</th><th class="r">% CA</th><th class="r">Factures</th>
          </tr></thead>
          <tbody>
            ${data.map(r => `<tr>
              <td><strong>${r.category}</strong></td>
              <td class="r">${fmt(r.totalHt)}</td>
              <td class="r bold">${fmt(r.totalTtc)}</td>
              <td class="r">${totalHt > 0 ? Math.round(r.totalHt / totalHt * 100) : 0}%</td>
              <td class="r">${r.invoiceCount}</td>
            </tr>`).join('')}
            <tr class="total-row">
              <td>Total</td>
              <td class="r">${fmt(totalHt)}</td>
              <td class="r">${fmt(totalTtc)}</td>
              <td class="r">100%</td>
              <td class="r">${data.reduce((s,r) => s+r.invoiceCount, 0)}</td>
            </tr>
          </tbody>
        </table>`;
      const html = reportHtml("Rapport — CA par catégorie", periodLabel(range), body, companyName, logoB64);
      const pdf  = await generatePdf(html);
      return sendPdfResponse(res, 'rapport-ca-categories.pdf', pdf);
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

reportsRouter.get('/unpaid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { format } = rangeSchema.parse(req.query);
    const data = await reportsService.getUnpaid();

    if (format === 'csv') {
      return sendCsvResponse(res, 'rapport-impayes.csv',
        ['Numéro', 'Client', 'Email', 'Date émission', 'Échéance', 'Total TTC', 'Solde dû', 'Statut'],
        data.map(r => [
          r.number, r.client.name, r.client.email,
          r.issueDate.toISOString().slice(0, 10),
          r.dueDate.toISOString().slice(0, 10),
          Number(r.totalTtc), Number(r.balanceDue), r.status,
        ]),
      );
    }

    if (format === 'pdf') {
      const { companyName, logoB64 } = await getReportAssets();
      const totalDue = data.reduce((s, r) => s + Number(r.balanceDue), 0);
      const now = new Date();
      const STATUS_FR: Record<string, string> = { issued: 'Émise', partially_paid: 'Part. payée', overdue: 'En retard' };
      const body = `
        ${data.length > 0 ? `<div class="alert-banner">
          <span>⚠ ${data.length} facture${data.length > 1 ? 's' : ''} impayée${data.length > 1 ? 's' : ''}</span>
          <span>${fmt(totalDue)}</span>
        </div>` : ''}
        <table>
          <thead><tr>
            <th>Numéro</th><th>Client</th><th>Émission</th><th>Échéance</th>
            <th class="r">Total TTC</th><th class="r">Solde dû</th><th>Statut</th>
          </tr></thead>
          <tbody>
            ${data.map(r => {
              const late = new Date(r.dueDate) < now;
              return `<tr>
                <td class="mono blue">${r.number}</td>
                <td>${r.client.name}</td>
                <td>${new Date(r.issueDate).toLocaleDateString('fr-FR')}</td>
                <td ${late ? 'style="color:#dc2626;font-weight:600"' : ''}>${new Date(r.dueDate).toLocaleDateString('fr-FR')}${late ? ' ⚠' : ''}</td>
                <td class="r">${fmt(Number(r.totalTtc))}</td>
                <td class="r red bold">${fmt(Number(r.balanceDue))}</td>
                <td><span class="badge ${r.status === 'overdue' ? 'badge-error' : 'badge-warning'}">${STATUS_FR[r.status] ?? r.status}</span></td>
              </tr>`;
            }).join('')}
            <tr class="total-row">
              <td colspan="5">Total dû</td>
              <td class="r">${fmt(totalDue)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>`;
      const html = reportHtml("Rapport — Factures impayées", `Au ${new Date().toLocaleDateString('fr-FR')}`, body, companyName, logoB64);
      const pdf  = await generatePdf(html);
      return sendPdfResponse(res, 'rapport-impayes.pdf', pdf);
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

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
      const { companyName, logoB64 } = await getReportAssets();
      const total = data.reduce((s, r) => s + Number(r.amount), 0);
      const METHOD_FR: Record<string, string> = { cash: 'Espèces', bank_transfer: 'Virement', check: 'Chèque', mobile_money: 'Mobile Money', card: 'Carte' };
      const body = `
        <div class="kpis">
          <div class="kpi"><div class="kpi-label">Total encaissé</div><div class="kpi-value green">${fmt(total)}</div></div>
          <div class="kpi"><div class="kpi-label">Nb encaissements</div><div class="kpi-value">${data.length}</div></div>
        </div>
        <table>
          <thead><tr>
            <th>Date</th><th>Facture</th><th>Client</th><th>Mode</th><th>Référence</th><th class="r">Montant</th>
          </tr></thead>
          <tbody>
            ${data.map(r => `<tr>
              <td>${new Date(r.paymentDate).toLocaleDateString('fr-FR')}</td>
              <td class="mono blue">${r.invoice.number}</td>
              <td>${r.invoice.client.name}</td>
              <td>${METHOD_FR[r.method] ?? r.method}</td>
              <td style="font-size:10px;color:#94a3b8">${r.reference ?? '—'}</td>
              <td class="r green bold">+${fmt(Number(r.amount))}</td>
            </tr>`).join('')}
            <tr class="total-row">
              <td colspan="5">Total</td>
              <td class="r">${fmt(total)}</td>
            </tr>
          </tbody>
        </table>`;
      const html = reportHtml("Rapport — Journal des encaissements", periodLabel(range), body, companyName, logoB64);
      const pdf  = await generatePdf(html);
      return sendPdfResponse(res, 'rapport-encaissements.pdf', pdf);
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

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
      const { companyName, logoB64 } = await getReportAssets();
      const totalHt  = data.reduce((s, r) => s + r.totalHt, 0);
      const totalTax = data.reduce((s, r) => s + r.totalTax, 0);
      const totalTtc = data.reduce((s, r) => s + r.totalTtc, 0);
      const body = `
        <div class="kpis">
          <div class="kpi"><div class="kpi-label">Base HT totale</div><div class="kpi-value blue">${fmt(totalHt)}</div></div>
          <div class="kpi"><div class="kpi-label">TVA collectée</div><div class="kpi-value purple">${fmt(totalTax)}</div></div>
          <div class="kpi"><div class="kpi-label">Total TTC</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div>
        </div>
        <p style="font-size:10px;color:#64748b;margin-bottom:14px">
          Taux TVA applicable : <strong>19,25%</strong> (SYSCOHADA — Cameroun)
        </p>
        <table>
          <thead><tr>
            <th>Période</th><th class="r">Base HT</th><th class="r">TVA collectée (19,25%)</th><th class="r">Total TTC</th><th class="r">Factures</th>
          </tr></thead>
          <tbody>
            ${data.map(r => `<tr>
              <td class="mono bold">${r.period}</td>
              <td class="r">${fmt(r.totalHt)}</td>
              <td class="r purple bold">${fmt(r.totalTax)}</td>
              <td class="r">${fmt(r.totalTtc)}</td>
              <td class="r">${r.count}</td>
            </tr>`).join('')}
            <tr class="total-row">
              <td>Total</td>
              <td class="r">${fmt(totalHt)}</td>
              <td class="r">${fmt(totalTax)}</td>
              <td class="r">${fmt(totalTtc)}</td>
              <td class="r">${data.reduce((s,r) => s+r.count, 0)}</td>
            </tr>
          </tbody>
        </table>
        <p style="font-size:10px;color:#94a3b8;margin-top:16px">
          Ce document récapitulatif de TVA est établi conformément aux règles SYSCOHADA révisé.
          À conserver pour les déclarations fiscales (DGI Cameroun).
        </p>`;
      const html = reportHtml("Rapport — Récapitulatif TVA", periodLabel(range), body, companyName, logoB64);
      const pdf  = await generatePdf(html);
      return sendPdfResponse(res, 'rapport-tva.pdf', pdf);
    }

    res.json({ success: true, data });
  } catch (err) { next(err); }
});
