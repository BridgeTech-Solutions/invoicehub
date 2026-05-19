import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { reportsService } from './reports.service';
import { fmt, periodLabel, daysLate, emptyRow, sendPdfResponse, reportHtml } from './reports.renderer';
import { sendCsvResponse } from '../../lib/csv';
import { generatePdf } from '../../lib/pdf';

const rangeSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo:   z.coerce.date().optional(),
  year:     z.coerce.number().int().min(2000).max(2100).optional(),
  quarter:  z.coerce.number().int().min(1).max(4).optional(),
  format:   z.enum(['json', 'csv', 'pdf']).default('json'),
});

const MONTHS: Record<string, string> = {
  '01':'Janvier','02':'Février','03':'Mars','04':'Avril',
  '05':'Mai','06':'Juin','07':'Juillet','08':'Août',
  '09':'Septembre','10':'Octobre','11':'Novembre','12':'Décembre',
};

const METHOD_FR: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', check: 'Chèque',
  mobile_money: 'Mobile Money', card: 'Carte',
  virement: 'Virement bancaire', especes: 'Espèces',
  cheque: 'Chèque', autre: 'Autre',
};

const STATUS_FR: Record<string, string> = {
  issued: 'Émise', partially_paid: 'Part. payée', overdue: 'En retard',
};

export class ReportsController {
  // ── GET /revenue ─────────────────────────────────────────────
  async getRevenue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format, ...range } = rangeSchema.parse(req.query);
      const data = await reportsService.getRevenue(range);

      if (format === 'csv') {
        sendCsvResponse(res, 'rapport-ca-mensuel.csv',
          ['Mois', 'Total HT', 'TVA', 'Total TTC', 'Nb Factures'],
          data.map(r => [r.month, r.totalHt, r.totalTax, r.totalTtc, r.count]),
        ); return;
      }

      if (format === 'pdf') {
        const assets   = await reportsService.getReportAssets();
        const totalHt  = data.reduce((s, r) => s + r.totalHt,  0);
        const totalTax = data.reduce((s, r) => s + r.totalTax, 0);
        const totalTtc = data.reduce((s, r) => s + r.totalTtc, 0);
        const count    = data.reduce((s, r) => s + r.count,    0);

        const body = `
          <div class="kpis">
            <div class="kpi accent-blue"><div class="kpi-label">CA HT</div><div class="kpi-value blue">${fmt(totalHt)}</div></div>
            <div class="kpi accent-purple"><div class="kpi-label">TVA collectée</div><div class="kpi-value purple">${fmt(totalTax)}</div></div>
            <div class="kpi accent-blue"><div class="kpi-label">Total TTC</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div>
            <div class="kpi"><div class="kpi-label">Factures émises</div><div class="kpi-value">${count}</div></div>
          </div>
          <div class="section-block">
            <div class="section-label">Détail mensuel</div>
            <table>
              <thead><tr><th>Mois</th><th class="r">Total HT</th><th class="r">TVA (19,25%)</th><th class="r">Total TTC</th><th class="r">Factures</th></tr></thead>
              <tbody>
                ${data.length === 0 ? emptyRow(5) : data.map(r => `<tr>
                  <td><strong>${MONTHS[r.month.slice(5)] ?? r.month.slice(5)}</strong> ${r.month.slice(0, 4)}</td>
                  <td class="r">${fmt(r.totalHt)}</td><td class="r purple">${fmt(r.totalTax)}</td>
                  <td class="r bold">${fmt(r.totalTtc)}</td><td class="r">${r.count}</td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr><td>Total période</td><td class="r">${fmt(totalHt)}</td><td class="r">${fmt(totalTax)}</td><td class="r">${fmt(totalTtc)}</td><td class="r">${count}</td></tr></tfoot>
            </table>
          </div>`;

        sendPdfResponse(res, 'rapport-ca-mensuel.pdf',
          await generatePdf(reportHtml({ reportType: 'Rapport financier', title: "Chiffre d'affaires mensuel", subtitle: periodLabel(range), body, ...assets })));
        return;
      }

      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // ── GET /by-client ───────────────────────────────────────────
  async getByClient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format, ...range } = rangeSchema.parse(req.query);
      const data = await reportsService.getRevenueByClient(range);

      if (format === 'csv') {
        sendCsvResponse(res, 'rapport-ca-clients.csv',
          ['Client', 'Email', 'Total HT', 'TVA', 'Total TTC', 'Payé', 'Solde dû', 'Nb Factures'],
          data.map(r => [r.client.name, r.client.email, r.totalHt, r.totalTax, r.totalTtc, r.amountPaid, r.balanceDue, r.invoiceCount]),
        ); return;
      }

      if (format === 'pdf') {
        const assets    = await reportsService.getReportAssets();
        const totalHt   = data.reduce((s, r) => s + r.totalHt,    0);
        const totalTtc  = data.reduce((s, r) => s + r.totalTtc,   0);
        const totalPaid = data.reduce((s, r) => s + r.amountPaid, 0);
        const totalDue  = data.reduce((s, r) => s + r.balanceDue, 0);
        const totalCnt  = data.reduce((s, r) => s + r.invoiceCount, 0);

        const body = `
          <div class="kpis">
            <div class="kpi accent-blue"><div class="kpi-label">CA Total TTC</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div>
            <div class="kpi accent-green"><div class="kpi-label">Encaissé</div><div class="kpi-value green">${fmt(totalPaid)}</div></div>
            <div class="kpi ${totalDue > 0 ? 'accent-red' : ''}"><div class="kpi-label">Solde dû</div><div class="kpi-value ${totalDue > 0 ? 'red' : ''}">${fmt(totalDue)}</div></div>
            <div class="kpi"><div class="kpi-label">Clients actifs</div><div class="kpi-value">${data.length}</div></div>
          </div>
          <div class="section-block">
            <div class="section-label">Répartition par client</div>
            <table>
              <thead><tr><th style="width:20px">#</th><th>Client</th><th class="r">Total HT</th><th class="r">Total TTC</th><th class="r">Encaissé</th><th class="r">Solde dû</th><th class="r">Factures</th></tr></thead>
              <tbody>
                ${data.length === 0 ? emptyRow(7) : data.map((r, i) => `<tr>
                  <td class="rank">${i + 1}</td>
                  <td><strong>${r.client.name}</strong>${r.client.email ? `<br/><span style="font-size:9px;color:#94a3b8">${r.client.email}</span>` : ''}</td>
                  <td class="r">${fmt(r.totalHt)}</td><td class="r bold">${fmt(r.totalTtc)}</td>
                  <td class="r green">${fmt(r.amountPaid)}</td>
                  <td class="r ${r.balanceDue > 0 ? 'red' : 'muted'}">${fmt(r.balanceDue)}</td>
                  <td class="r">${r.invoiceCount}</td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr><td colspan="2">Total</td><td class="r">${fmt(totalHt)}</td><td class="r">${fmt(totalTtc)}</td><td class="r">${fmt(totalPaid)}</td><td class="r">${fmt(totalDue)}</td><td class="r">${totalCnt}</td></tr></tfoot>
            </table>
          </div>`;

        sendPdfResponse(res, 'rapport-ca-clients.pdf',
          await generatePdf(reportHtml({ reportType: 'Rapport financier', title: "Chiffre d'affaires par client", subtitle: periodLabel(range), body, ...assets })));
        return;
      }

      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // ── GET /by-category ─────────────────────────────────────────
  async getByCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format, ...range } = rangeSchema.parse(req.query);
      const data = await reportsService.getRevenueByCategory(range);

      if (format === 'csv') {
        sendCsvResponse(res, 'rapport-ca-categories.csv',
          ['Catégorie', 'Total HT', 'Total TTC', 'Nb Factures'],
          data.map(r => [r.category, r.totalHt, r.totalTtc, r.invoiceCount]),
        ); return;
      }

      if (format === 'pdf') {
        const assets   = await reportsService.getReportAssets();
        const totalHt  = data.reduce((s, r) => s + r.totalHt,      0);
        const totalTtc = data.reduce((s, r) => s + r.totalTtc,     0);
        const totalCnt = data.reduce((s, r) => s + r.invoiceCount, 0);

        const body = `
          <div class="kpis">
            <div class="kpi accent-blue"><div class="kpi-label">CA HT total</div><div class="kpi-value blue">${fmt(totalHt)}</div></div>
            <div class="kpi accent-blue"><div class="kpi-label">CA TTC total</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div>
            <div class="kpi"><div class="kpi-label">Catégories actives</div><div class="kpi-value">${data.length}</div></div>
          </div>
          <div class="section-block">
            <div class="section-label">Répartition du chiffre d'affaires</div>
            <table>
              <thead><tr><th>Catégorie</th><th class="r">Total HT</th><th class="r">Total TTC</th><th class="r">Part du CA</th><th class="r">Factures</th></tr></thead>
              <tbody>
                ${data.length === 0 ? emptyRow(5) : data.map(r => {
                  const pct = totalHt > 0 ? Math.round(r.totalHt / totalHt * 100) : 0;
                  return `<tr>
                    <td><strong>${r.category}</strong></td>
                    <td class="r">${fmt(r.totalHt)}</td><td class="r bold">${fmt(r.totalTtc)}</td>
                    <td class="r"><div class="progress-wrap"><div class="progress-bg"><div class="progress-fill" style="width:${Math.max(1, pct)}%"></div></div><span class="progress-pct">${pct}%</span></div></td>
                    <td class="r">${r.invoiceCount}</td>
                  </tr>`;
                }).join('')}
              </tbody>
              <tfoot><tr><td>Total</td><td class="r">${fmt(totalHt)}</td><td class="r">${fmt(totalTtc)}</td><td class="r">100%</td><td class="r">${totalCnt}</td></tr></tfoot>
            </table>
          </div>`;

        sendPdfResponse(res, 'rapport-ca-categories.pdf',
          await generatePdf(reportHtml({ reportType: 'Rapport financier', title: "Chiffre d'affaires par catégorie", subtitle: periodLabel(range), body, ...assets })));
        return;
      }

      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // ── GET /unpaid ──────────────────────────────────────────────
  async getUnpaid(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format, ...range } = rangeSchema.parse(req.query);
      const data = await reportsService.getUnpaid(range);
      const now  = new Date();

      if (format === 'csv') {
        sendCsvResponse(res, 'rapport-impayes.csv',
          ['Numéro', 'Client', 'Email', 'Date émission', 'Échéance', 'Retard (j)', 'Total TTC', 'Solde dû', 'Statut'],
          data.map(r => {
            const late = new Date(r.dueDate) < now;
            return [r.number, r.client.name, r.client.email, r.issueDate.toISOString().slice(0, 10),
              r.dueDate.toISOString().slice(0, 10), late ? daysLate(r.dueDate) : 0,
              Number(r.totalTtc), Number(r.balanceDue), r.status];
          }),
        ); return;
      }

      if (format === 'pdf') {
        const assets   = await reportsService.getReportAssets();
        const totalDue = data.reduce((s, r) => s + Number(r.balanceDue), 0);

        const body = `
          ${data.length > 0 ? `<div class="alert-banner">
            <div class="alert-left"><span class="alert-icon">!</span>
              <span class="alert-text">${data.length} facture${data.length > 1 ? 's' : ''} impayée${data.length > 1 ? 's' : ''} au ${now.toLocaleDateString('fr-FR')}</span>
            </div><span class="alert-amount">${fmt(totalDue)}</span>
          </div>` : ''}
          <div class="section-block">
            <div class="section-label">Détail des impayés — trié par retard décroissant</div>
            <table>
              <thead><tr><th>Numéro</th><th>Client</th><th>Émission</th><th>Échéance</th><th class="r">Retard</th><th class="r">Total TTC</th><th class="r">Solde dû</th><th>Statut</th></tr></thead>
              <tbody>
                ${data.length === 0 ? emptyRow(8, 'Aucune facture impayée — situation saine') : data.map(r => {
                  const late = new Date(r.dueDate) < now;
                  const days = late ? daysLate(r.dueDate) : 0;
                  return `<tr>
                    <td class="mono blue">${r.number}</td><td><strong>${r.client.name}</strong></td>
                    <td class="muted">${new Date(r.issueDate).toLocaleDateString('fr-FR')}</td>
                    <td style="${late ? 'color:#b91c1c;font-weight:600' : ''}">${new Date(r.dueDate).toLocaleDateString('fr-FR')}</td>
                    <td class="r">${late ? `<span class="late-pill">J+${days}</span>` : '<span class="muted">—</span>'}</td>
                    <td class="r">${fmt(Number(r.totalTtc))}</td>
                    <td class="r red bold">${fmt(Number(r.balanceDue))}</td>
                    <td><span class="badge ${r.status === 'overdue' ? 'badge-error' : 'badge-warning'}">${STATUS_FR[r.status] ?? r.status}</span></td>
                  </tr>`;
                }).join('')}
              </tbody>
              <tfoot><tr><td colspan="6">Total impayé</td><td class="r">${fmt(totalDue)}</td><td></td></tr></tfoot>
            </table>
          </div>`;

        sendPdfResponse(res, 'rapport-impayes.pdf',
          await generatePdf(reportHtml({
            reportType: 'Rapport de recouvrement', title: 'Factures impayées',
            subtitle: `Situation au ${now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
            body, ...assets,
          })));
        return;
      }

      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // ── GET /payments ────────────────────────────────────────────
  async getPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format, ...range } = rangeSchema.parse(req.query);
      const data = await reportsService.getPayments(range);

      if (format === 'csv') {
        sendCsvResponse(res, 'rapport-encaissements.csv',
          ['Date', 'Facture', 'Client', 'Méthode', 'Montant', 'Référence'],
          data.map(r => [r.paymentDate.toISOString().slice(0, 10), r.invoice.number, r.invoice.client.name, r.method, Number(r.amount), r.reference ?? '']),
        ); return;
      }

      if (format === 'pdf') {
        const assets = await reportsService.getReportAssets();
        const total  = data.reduce((s, r) => s + Number(r.amount), 0);
        const byMethod: Record<string, number> = {};
        for (const r of data) byMethod[r.method] = (byMethod[r.method] ?? 0) + Number(r.amount);

        const body = `
          <div class="kpis">
            <div class="kpi accent-green"><div class="kpi-label">Total encaissé</div><div class="kpi-value green">${fmt(total)}</div></div>
            <div class="kpi"><div class="kpi-label">Nb encaissements</div><div class="kpi-value">${data.length}</div></div>
            ${Object.entries(byMethod).slice(0, 2).map(([m, a]) => `<div class="kpi"><div class="kpi-label">${METHOD_FR[m] ?? m}</div><div class="kpi-value">${fmt(a)}</div></div>`).join('')}
          </div>
          <div class="section-block">
            <div class="section-label">Journal chronologique des encaissements</div>
            <table>
              <thead><tr><th>Date</th><th>Facture</th><th>Client</th><th>Mode</th><th>Référence</th><th class="r">Montant</th></tr></thead>
              <tbody>
                ${data.length === 0 ? emptyRow(6) : data.map(r => `<tr>
                  <td class="muted">${new Date(r.paymentDate).toLocaleDateString('fr-FR')}</td>
                  <td class="mono blue">${r.invoice.number}</td><td>${r.invoice.client.name}</td>
                  <td>${METHOD_FR[r.method] ?? r.method}</td>
                  <td class="muted mono">${r.reference ?? '—'}</td>
                  <td class="r green bold">+${fmt(Number(r.amount))}</td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr><td colspan="5">Total encaissé</td><td class="r">${fmt(total)}</td></tr></tfoot>
            </table>
          </div>`;

        sendPdfResponse(res, 'rapport-encaissements.pdf',
          await generatePdf(reportHtml({ reportType: 'Journal comptable', title: 'Journal des encaissements', subtitle: periodLabel(range), body, ...assets })));
        return;
      }

      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // ── GET /by-method ───────────────────────────────────────────
  async getByMethod(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format, ...range } = rangeSchema.parse(req.query);
      const data = await reportsService.getPaymentsByMethod(range);

      if (format === 'csv') {
        sendCsvResponse(res, 'rapport-paiements-methodes.csv',
          ['Méthode', 'Total encaissé', 'Nb paiements', 'Part (%)'],
          data.map(r => [r.method, r.total, r.count, r.percentage]),
        ); return;
      }

      if (format === 'pdf') {
        const assets     = await reportsService.getReportAssets();
        const grandTotal = data.reduce((s, r) => s + r.total, 0);
        const grandCount = data.reduce((s, r) => s + r.count, 0);

        const body = `
          <div class="kpis">
            <div class="kpi accent-green"><div class="kpi-label">Total encaissé</div><div class="kpi-value green">${fmt(grandTotal)}</div></div>
            <div class="kpi"><div class="kpi-label">Nb paiements</div><div class="kpi-value">${grandCount}</div></div>
            <div class="kpi"><div class="kpi-label">Méthodes utilisées</div><div class="kpi-value">${data.length}</div></div>
          </div>
          <div class="section-block">
            <div class="section-label">Répartition par méthode de règlement</div>
            <table>
              <thead><tr><th>Méthode</th><th class="r">Total encaissé</th><th class="r">Nb paiements</th><th class="r">Part du total</th></tr></thead>
              <tbody>
                ${data.length === 0 ? emptyRow(4) : data.map(r => `<tr>
                  <td><strong>${METHOD_FR[r.method] ?? r.method}</strong></td>
                  <td class="r green bold">${fmt(r.total)}</td><td class="r">${r.count}</td>
                  <td class="r"><div class="progress-wrap"><div class="progress-bg"><div class="progress-fill" style="width:${Math.max(1, r.percentage)}%"></div></div><span class="progress-pct">${r.percentage}%</span></div></td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr><td>Total</td><td class="r">${fmt(grandTotal)}</td><td class="r">${grandCount}</td><td class="r">100%</td></tr></tfoot>
            </table>
          </div>`;

        sendPdfResponse(res, 'rapport-paiements-methodes.pdf',
          await generatePdf(reportHtml({ reportType: 'Rapport de trésorerie', title: 'Encaissements par méthode de règlement', subtitle: periodLabel(range), body, ...assets })));
        return;
      }

      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // ── GET /tax-summary ─────────────────────────────────────────
  async getTaxSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format, ...range } = rangeSchema.parse(req.query);
      const data = await reportsService.getTaxSummary(range);

      if (format === 'csv') {
        sendCsvResponse(res, 'rapport-tva.csv',
          ['Période', 'Base HT', 'TVA collectée', 'Total TTC', 'Nb Factures'],
          data.map(r => [r.period, r.totalHt, r.totalTax, r.totalTtc, r.count]),
        ); return;
      }

      if (format === 'pdf') {
        const assets   = await reportsService.getReportAssets();
        const totalHt  = data.reduce((s, r) => s + r.totalHt,  0);
        const totalTax = data.reduce((s, r) => s + r.totalTax, 0);
        const totalTtc = data.reduce((s, r) => s + r.totalTtc, 0);
        const totalCnt = data.reduce((s, r) => s + r.count,    0);
        const effectiveRate = totalHt > 0
          ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((totalTax / totalHt) * 100)
          : '0,00';

        const body = `
          <div class="kpis">
            <div class="kpi accent-blue"><div class="kpi-label">Base HT totale</div><div class="kpi-value blue">${fmt(totalHt)}</div></div>
            <div class="kpi accent-purple"><div class="kpi-label">TVA collectée</div><div class="kpi-value purple">${fmt(totalTax)}</div></div>
            <div class="kpi accent-blue"><div class="kpi-label">Total TTC</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div>
            <div class="kpi"><div class="kpi-label">Taux effectif moyen</div><div class="kpi-value">${effectiveRate}%</div></div>
          </div>
          <div class="info-box"><strong>Taux TVA : 19,25%</strong> — Conformément au CGI du Cameroun et aux règles SYSCOHADA révisé.</div>
          <div class="section-block">
            <div class="section-label">Détail par période</div>
            <table>
              <thead><tr><th>Période</th><th class="r">Base imposable HT</th><th class="r">TVA collectée (19,25%)</th><th class="r">Total TTC</th><th class="r">Factures</th></tr></thead>
              <tbody>
                ${data.length === 0 ? emptyRow(5) : data.map(r => `<tr>
                  <td class="mono bold">${r.period}</td><td class="r">${fmt(r.totalHt)}</td>
                  <td class="r purple bold">${fmt(r.totalTax)}</td><td class="r">${fmt(r.totalTtc)}</td><td class="r">${r.count}</td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr><td>Total</td><td class="r">${fmt(totalHt)}</td><td class="r">${fmt(totalTax)}</td><td class="r">${fmt(totalTtc)}</td><td class="r">${totalCnt}</td></tr></tfoot>
            </table>
          </div>`;

        sendPdfResponse(res, 'rapport-tva.pdf',
          await generatePdf(reportHtml({
            reportType: 'Déclaration fiscale', title: 'Récapitulatif TVA', subtitle: periodLabel(range), body,
            footerNote: 'Document établi conformément au CGI du Cameroun et aux règles SYSCOHADA révisé. Taux TVA : 19,25%.',
            ...assets,
          })));
        return;
      }

      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // ── GET /aging ───────────────────────────────────────────────
  async getAging(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format } = rangeSchema.parse(req.query);
      const { rows, buckets, total } = await reportsService.getAgingReport();
      const now = new Date();

      if (format === 'csv') {
        sendCsvResponse(res, 'rapport-aging.csv',
          ['Numéro', 'Client', 'Email', 'Date émission', 'Échéance', 'Retard (j)', 'Total TTC', 'Solde dû', 'Statut', 'Tranche'],
          rows.map(r => [r.number, r.client.name, r.client.email ?? '', new Date(r.issueDate).toLocaleDateString('fr-FR'),
            new Date(r.dueDate).toLocaleDateString('fr-FR'), r.daysLate, r.totalTtc, r.balanceDue, r.status, buckets[r.bucket].label]),
        ); return;
      }

      if (format === 'pdf') {
        const assets = await reportsService.getReportAssets();
        const BUCKET_COLOR: Record<string, string> = {
          current: '#16a34a', days_1_30: '#ca8a04', days_31_60: '#ea580c', days_61_90: '#dc2626', over_90: '#7f1d1d',
        };

        const body = `
          <div class="kpis">
            ${Object.entries(buckets).map(([key, b]) => `<div class="kpi ${b.amount > 0 && key !== 'current' ? 'accent-red' : ''}">
              <div class="kpi-label">${b.label} <span class="muted">(${b.count})</span></div>
              <div class="kpi-value" style="color:${BUCKET_COLOR[key]}">${fmt(b.amount)}</div>
            </div>`).join('')}
          </div>
          ${total.amount > 0 ? `<div class="alert-banner">
            <div class="alert-left"><span class="alert-icon">!</span>
              <span class="alert-text">${total.count} facture${total.count > 1 ? 's' : ''} impayée${total.count > 1 ? 's' : ''} au ${now.toLocaleDateString('fr-FR')}</span>
            </div><span class="alert-amount">${fmt(total.amount)}</span>
          </div>` : ''}
          <div class="section-block">
            <div class="section-label">Détail par facture — trié par retard décroissant</div>
            <table>
              <thead><tr><th>Numéro</th><th>Client</th><th>Échéance</th><th class="r">Retard</th><th>Tranche</th><th class="r">Total TTC</th><th class="r">Solde dû</th><th>Statut</th></tr></thead>
              <tbody>
                ${rows.length === 0 ? emptyRow(8, 'Aucune facture impayée — situation saine') : rows.map(r => `<tr>
                  <td class="mono blue">${r.number}</td><td><strong>${r.client.name}</strong></td>
                  <td style="${r.daysLate > 0 ? 'color:#b91c1c;font-weight:600' : ''}">${new Date(r.dueDate).toLocaleDateString('fr-FR')}</td>
                  <td class="r">${r.daysLate > 0 ? `<span class="late-pill">J+${r.daysLate}</span>` : '<span class="muted">—</span>'}</td>
                  <td><span style="color:${BUCKET_COLOR[r.bucket]};font-weight:600">${buckets[r.bucket].label}</span></td>
                  <td class="r">${fmt(r.totalTtc)}</td><td class="r red bold">${fmt(r.balanceDue)}</td>
                  <td><span class="badge ${r.status === 'overdue' ? 'badge-error' : 'badge-warning'}">${STATUS_FR[r.status] ?? r.status}</span></td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr><td colspan="6">Total impayé</td><td class="r">${fmt(total.amount)}</td><td></td></tr></tfoot>
            </table>
          </div>`;

        sendPdfResponse(res, 'rapport-aging.pdf',
          await generatePdf(reportHtml({
            reportType: 'Rapport de recouvrement', title: 'Vieillissement des impayés (Aging Report)',
            subtitle: `Situation au ${now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
            body, footerNote: 'Ce rapport classe les factures impayées par tranche de retard. SYSCOHADA révisé.', ...assets,
          })));
        return;
      }

      res.json({ success: true, data: { rows, buckets, total } });
    } catch (err) { next(err); }
  }
}

export const reportsController = new ReportsController();
