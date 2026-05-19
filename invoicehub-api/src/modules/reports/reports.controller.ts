import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { Permission } from '../../common/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import { ReportsService } from './reports.service';
import { sendCsvResponse } from '../../lib/csv';
import { generatePdf } from '../../lib/pdf';
import { fmt, periodLabel, daysLate, emptyRow, sendPdfResponse, reportHtml } from './reports.renderer';

const STATUS_FR: Record<string, string> = { issued: 'Émise', partially_paid: 'Part. payée', overdue: 'En retard' };

const rangeSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo:   z.coerce.date().optional(),
  year:     z.coerce.number().int().min(2000).max(2100).optional(),
  quarter:  z.coerce.number().int().min(1).max(4).optional(),
  format:   z.enum(['json', 'csv', 'pdf']).default('json'),
});

@Controller('reports')
@Permission('reports:read')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue')
  @SkipResponseWrapper()
  async getRevenue(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getRevenue(range);

    if (format === 'csv') {
      sendCsvResponse(res, 'rapport-ca-mensuel.csv', ['Mois', 'Total HT', 'TVA', 'Total TTC', 'Nb Factures'], data.map(r => [r.month, r.totalHt, r.totalTax, r.totalTtc, r.count]));
      return;
    }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const [totalHt, totalTax, totalTtc, count] = [data.reduce((s, r) => s + r.totalHt, 0), data.reduce((s, r) => s + r.totalTax, 0), data.reduce((s, r) => s + r.totalTtc, 0), data.reduce((s, r) => s + r.count, 0)];
      const body = `<div class="kpis"><div class="kpi accent-blue"><div class="kpi-label">CA HT</div><div class="kpi-value blue">${fmt(totalHt)}</div></div><div class="kpi accent-purple"><div class="kpi-label">TVA collectée</div><div class="kpi-value purple">${fmt(totalTax)}</div></div><div class="kpi accent-blue"><div class="kpi-label">Total TTC</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div><div class="kpi"><div class="kpi-label">Factures émises</div><div class="kpi-value">${count}</div></div></div>`;
      sendPdfResponse(res, 'rapport-ca-mensuel.pdf', await generatePdf(reportHtml({ reportType: 'Rapport financier', title: "Chiffre d'affaires mensuel", subtitle: periodLabel(range), body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('by-client')
  @SkipResponseWrapper()
  async getByClient(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getRevenueByClient(range);
    if (format === 'csv') { sendCsvResponse(res, 'rapport-ca-clients.csv', ['Client', 'Email', 'Total HT', 'TVA', 'Total TTC', 'Payé', 'Solde dû', 'Nb Factures'], data.map(r => [r.client.name, r.client.email, r.totalHt, r.totalTax, r.totalTtc, r.amountPaid, r.balanceDue, r.invoiceCount])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const [totalHt, totalTtc, totalPaid, totalDue, totalCnt] = [data.reduce((s, r) => s + r.totalHt, 0), data.reduce((s, r) => s + r.totalTtc, 0), data.reduce((s, r) => s + r.amountPaid, 0), data.reduce((s, r) => s + r.balanceDue, 0), data.reduce((s, r) => s + r.invoiceCount, 0)];
      const body = `<div class="kpis"><div class="kpi accent-blue"><div class="kpi-label">CA Total TTC</div><div class="kpi-value blue">${fmt(totalTtc)}</div></div><div class="kpi accent-green"><div class="kpi-label">Encaissé</div><div class="kpi-value green">${fmt(totalPaid)}</div></div><div class="kpi ${totalDue > 0 ? 'accent-red' : ''}"><div class="kpi-label">Solde dû</div><div class="kpi-value ${totalDue > 0 ? 'red' : ''}">${fmt(totalDue)}</div></div><div class="kpi"><div class="kpi-label">Clients actifs</div><div class="kpi-value">${data.length}</div></div></div>`;
      sendPdfResponse(res, 'rapport-ca-clients.pdf', await generatePdf(reportHtml({ reportType: 'Rapport financier', title: "Chiffre d'affaires par client", subtitle: periodLabel(range), body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('by-category')
  @SkipResponseWrapper()
  async getByCategory(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getRevenueByCategory(range);
    if (format === 'csv') { sendCsvResponse(res, 'rapport-ca-categories.csv', ['Catégorie', 'Total HT', 'Total TTC', 'Nb Factures'], data.map(r => [r.category, r.totalHt, r.totalTtc, r.invoiceCount])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const body = `<div class="kpis"><div class="kpi accent-blue"><div class="kpi-label">CA HT total</div><div class="kpi-value blue">${fmt(data.reduce((s, r) => s + r.totalHt, 0))}</div></div></div>`;
      sendPdfResponse(res, 'rapport-ca-categories.pdf', await generatePdf(reportHtml({ reportType: 'Rapport financier', title: 'CA par catégorie', subtitle: periodLabel(range), body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('unpaid')
  @SkipResponseWrapper()
  async getUnpaid(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getUnpaid(range);
    const now  = new Date();
    if (format === 'csv') { sendCsvResponse(res, 'rapport-impayes.csv', ['Numéro', 'Client', 'Email', 'Date émission', 'Échéance', 'Retard (j)', 'Total TTC', 'Solde dû', 'Statut'], data.map(r => { const late = new Date(r.dueDate) < now; return [r.number, r.client.name, r.client.email, r.issueDate.toISOString().slice(0, 10), r.dueDate.toISOString().slice(0, 10), late ? daysLate(r.dueDate) : 0, Number(r.totalTtc), Number(r.balanceDue), r.status]; })); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const totalDue = data.reduce((s, r) => s + Number(r.balanceDue), 0);
      const body = `<div class="section-block"><table><thead><tr><th>Numéro</th><th>Client</th><th>Émission</th><th>Échéance</th><th class="r">Retard</th><th class="r">Total TTC</th><th class="r">Solde dû</th><th>Statut</th></tr></thead><tbody>${data.length === 0 ? emptyRow(8) : data.map(r => { const late = new Date(r.dueDate) < now; const days = late ? daysLate(r.dueDate) : 0; return `<tr><td class="mono blue">${r.number}</td><td>${r.client.name}</td><td>${new Date(r.issueDate).toLocaleDateString('fr-FR')}</td><td>${new Date(r.dueDate).toLocaleDateString('fr-FR')}</td><td class="r">${late ? `<span class="late-pill">J+${days}</span>` : '—'}</td><td class="r">${fmt(Number(r.totalTtc))}</td><td class="r red bold">${fmt(Number(r.balanceDue))}</td><td><span class="badge ${r.status === 'overdue' ? 'badge-error' : 'badge-warning'}">${STATUS_FR[String(r.status)] ?? r.status}</span></td></tr>`; }).join('')}</tbody><tfoot><tr><td colspan="6">Total impayé</td><td class="r">${fmt(totalDue)}</td><td></td></tr></tfoot></table></div>`;
      sendPdfResponse(res, 'rapport-impayes.pdf', await generatePdf(reportHtml({ reportType: 'Rapport de recouvrement', title: 'Factures impayées', subtitle: `Situation au ${now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('payments')
  @SkipResponseWrapper()
  async getPayments(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getPayments(range);
    if (format === 'csv') { sendCsvResponse(res, 'rapport-encaissements.csv', ['Date', 'Facture', 'Client', 'Méthode', 'Montant', 'Référence'], data.map(r => [r.paymentDate.toISOString().slice(0, 10), (r as any).invoice.number, (r as any).invoice.client.name, r.method, Number(r.amount), r.reference ?? ''])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const total = data.reduce((s, r) => s + Number(r.amount), 0);
      const body = `<div class="kpis"><div class="kpi accent-green"><div class="kpi-label">Total encaissé</div><div class="kpi-value green">${fmt(total)}</div></div><div class="kpi"><div class="kpi-label">Nb encaissements</div><div class="kpi-value">${data.length}</div></div></div>`;
      sendPdfResponse(res, 'rapport-encaissements.pdf', await generatePdf(reportHtml({ reportType: 'Journal comptable', title: 'Journal des encaissements', subtitle: periodLabel(range), body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('by-method')
  @SkipResponseWrapper()
  async getByMethod(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getPaymentsByMethod(range);
    if (format === 'csv') { sendCsvResponse(res, 'rapport-paiements-methodes.csv', ['Méthode', 'Total encaissé', 'Nb paiements', 'Part (%)'], data.map(r => [r.method, r.total, r.count, r.percentage])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const body = `<div class="kpis"><div class="kpi accent-green"><div class="kpi-label">Total encaissé</div><div class="kpi-value green">${fmt(data.reduce((s, r) => s + r.total, 0))}</div></div></div>`;
      sendPdfResponse(res, 'rapport-paiements-methodes.pdf', await generatePdf(reportHtml({ reportType: 'Rapport de trésorerie', title: 'Encaissements par méthode', subtitle: periodLabel(range), body, ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('tax-summary')
  @SkipResponseWrapper()
  async getTaxSummary(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format, ...range } = rangeSchema.parse(query);
    const data = await this.reportsService.getTaxSummary(range);
    if (format === 'csv') { sendCsvResponse(res, 'rapport-tva.csv', ['Période', 'Base HT', 'TVA collectée', 'Total TTC', 'Nb Factures'], data.map(r => [r.period, r.totalHt, r.totalTax, r.totalTtc, r.count])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const body = `<div class="info-box"><strong>Taux TVA : 19,25%</strong> — Conformément au CGI du Cameroun et aux règles SYSCOHADA révisé.</div>`;
      sendPdfResponse(res, 'rapport-tva.pdf', await generatePdf(reportHtml({ reportType: 'Déclaration fiscale', title: 'Récapitulatif TVA', subtitle: periodLabel(range), body, footerNote: 'Document établi conformément au CGI du Cameroun. Taux TVA : 19,25%.', ...assets })));
      return;
    }
    res.json({ success: true, data });
  }

  @Get('aging')
  @SkipResponseWrapper()
  async getAging(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const { format } = rangeSchema.parse(query);
    const { rows, buckets, total } = await this.reportsService.getAgingReport();
    const now = new Date();
    if (format === 'csv') { sendCsvResponse(res, 'rapport-aging.csv', ['Numéro', 'Client', 'Email', 'Date émission', 'Échéance', 'Retard (j)', 'Total TTC', 'Solde dû', 'Statut', 'Tranche'], rows.map(r => [r.number, r.client.name, (r.client as any).email ?? '', new Date(r.issueDate).toLocaleDateString('fr-FR'), new Date(r.dueDate).toLocaleDateString('fr-FR'), r.daysLate, r.totalTtc, r.balanceDue, r.status, buckets[r.bucket as keyof typeof buckets].label])); return; }
    if (format === 'pdf') {
      const assets = await this.reportsService.getReportAssets();
      const body = `<div class="kpis">${Object.entries(buckets).map(([, b]) => `<div class="kpi"><div class="kpi-label">${b.label}</div><div class="kpi-value">${fmt(b.amount)}</div></div>`).join('')}</div>`;
      sendPdfResponse(res, 'rapport-aging.pdf', await generatePdf(reportHtml({ reportType: 'Rapport de recouvrement', title: 'Vieillissement des impayés', subtitle: `Situation au ${now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, body, ...assets })));
      return;
    }
    res.json({ success: true, data: { rows, buckets, total } });
  }
}
