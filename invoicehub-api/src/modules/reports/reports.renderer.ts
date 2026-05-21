import { Response } from 'express';

export function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' XAF';
}

export function periodLabel(range: { year?: number; quarter?: number; dateFrom?: Date; dateTo?: Date }): string {
  if (range.dateFrom && range.dateTo) {
    return `Du ${range.dateFrom.toLocaleDateString('fr-FR')} au ${range.dateTo.toLocaleDateString('fr-FR')}`;
  }
  const year = range.year ?? new Date().getFullYear();
  if (range.quarter) return `${year} — Trimestre ${range.quarter}`;
  return `Année ${year}`;
}

export function daysLate(dueDate: Date | string): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000);
}

export function emptyRow(cols: number, message = 'Aucune donnée pour cette période'): string {
  return `<tr><td colspan="${cols}" style="text-align:center;color:#94a3b8;font-style:italic;padding:20px 0">${message}</td></tr>`;
}

export function sendPdfResponse(res: Response, filename: string, buffer: Buffer): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.end(buffer);
}

export const REPORT_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5px; line-height: 1.5; color: #1e293b;
    width: 210mm; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  @page { margin: 0; size: A4 portrait; }
  @media print {
    .no-print { display: none !important; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    .section-block { page-break-inside: avoid; }
  }
  .page-header img, .page-footer img { width: 100%; display: block; }
  .page-content { padding: 6mm 15mm 10mm; }
  .report-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    margin-bottom: 18px; padding-bottom: 12px; border-bottom: 3px solid #0f2d4a;
  }
  .report-header-left { display: flex; flex-direction: column; gap: 4px; }
  .report-badge {
    display: inline-block; padding: 2px 8px; background: #0f2d4a; color: #fff;
    font-size: 7.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.12em; border-radius: 3px; width: fit-content; margin-bottom: 3px;
  }
  .report-title { font-size: 17px; font-weight: 800; color: #0f2d4a; letter-spacing: -0.02em; line-height: 1.2; }
  .report-period { font-size: 10.5px; color: #475569; font-weight: 500; margin-top: 2px; }
  .report-header-right { text-align: right; flex-shrink: 0; }
  .company-name { font-size: 12px; font-weight: 800; color: #0f2d4a; }
  .report-generated { font-size: 8.5px; color: #94a3b8; margin-top: 4px; }
  .report-ref { font-size: 8px; color: #cbd5e1; font-family: 'Courier New', monospace; margin-top: 2px; }
  .kpis { display: flex; gap: 8px; margin-bottom: 16px; }
  .kpi {
    flex: 1; padding: 10px 12px; background: #f8fafc;
    border: 1px solid #e2e8f0; border-left: 3px solid #0f2d4a; border-radius: 3px;
  }
  .kpi-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-bottom: 5px; }
  .kpi-value { font-size: 14px; font-weight: 800; color: #0f2d4a; font-family: 'Courier New', monospace; font-variant-numeric: tabular-nums; line-height: 1; }
  .kpi-value.blue { color: #2D7DD2; } .kpi-value.purple { color: #7c3aed; }
  .kpi-value.green { color: #059669; } .kpi-value.red { color: #dc2626; }
  .kpi.accent-blue { border-left-color: #2D7DD2; } .kpi.accent-purple { border-left-color: #7c3aed; }
  .kpi.accent-green { border-left-color: #059669; } .kpi.accent-red { border-left-color: #dc2626; }
  .section-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid #f1f5f9; }
  .alert-banner {
    padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca;
    border-left: 4px solid #dc2626; border-radius: 3px; margin-bottom: 14px;
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
  }
  .alert-left { display: flex; align-items: center; gap: 8px; }
  .alert-icon { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; background: #dc2626; color: #fff; border-radius: 50%; font-size: 10px; font-weight: 900; flex-shrink: 0; line-height: 1; }
  .alert-text { font-size: 11px; font-weight: 700; color: #b91c1c; }
  .alert-amount { font-size: 13px; font-weight: 800; color: #b91c1c; font-family: 'Courier New', monospace; white-space: nowrap; }
  .info-box { padding: 8px 12px; background: #f0f9ff; border: 1px solid #bae6fd; border-left: 3px solid #0284c7; border-radius: 3px; margin-bottom: 14px; font-size: 10px; color: #0369a1; line-height: 1.5; }
  .info-box strong { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; } tfoot { display: table-footer-group; }
  thead tr { background: #0f2d4a; }
  th { padding: 8px 9px; font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #fff; text-align: left; white-space: nowrap; border: none; }
  th.r { text-align: right; }
  td { padding: 8.5px 9px; font-size: 10.5px; color: #334155; border-bottom: 1px solid #f1f5f9; vertical-align: middle; background: transparent; }
  td.r { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; font-variant-numeric: tabular-nums; }
  td.bold { font-weight: 700; } td.blue { color: #2D7DD2; font-weight: 600; }
  td.purple { color: #7c3aed; font-weight: 700; } td.green { color: #059669; font-weight: 600; }
  td.red { color: #dc2626; font-weight: 700; }
  td.mono { font-family: 'Courier New', monospace; font-size: 10px; }
  td.muted { color: #94a3b8; font-size: 9.5px; }
  td.rank { color: #cbd5e1; font-size: 9.5px; font-family: 'Courier New', monospace; width: 24px; }
  tbody tr:nth-child(even) td { background: rgba(248,250,252,0.8); }
  tfoot tr td { background: #f1f5f9 !important; font-weight: 800; color: #0f2d4a; font-size: 11px; border-top: 2px solid #0f2d4a; border-bottom: none; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid transparent; white-space: nowrap; }
  .badge-warning { background: rgba(245,158,11,0.1); color: #b45309; border-color: rgba(245,158,11,0.3); }
  .badge-error { background: rgba(239,68,68,0.1); color: #b91c1c; border-color: rgba(239,68,68,0.3); }
  .badge-success { background: rgba(16,185,129,0.1); color: #065f46; border-color: rgba(16,185,129,0.3); }
  .badge-neutral { background: rgba(100,116,139,0.1); color: #475569; border-color: rgba(100,116,139,0.2); }
  .progress-wrap { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
  .progress-bg { width: 50px; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; flex-shrink: 0; }
  .progress-fill { height: 100%; background: #2D7DD2; border-radius: 3px; }
  .progress-pct { font-family: 'Courier New', monospace; font-size: 10px; color: #475569; min-width: 30px; text-align: right; }
  .late-pill { display: inline-block; padding: 2px 6px; background: rgba(239,68,68,0.1); color: #b91c1c; border: 1px solid rgba(239,68,68,0.25); border-radius: 10px; font-size: 9px; font-weight: 700; font-family: 'Courier New', monospace; white-space: nowrap; }
  .report-footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .report-footer-note { font-size: 8.5px; color: #94a3b8; line-height: 1.5; max-width: 75%; }
  .report-footer-brand { font-size: 8px; color: #cbd5e1; text-align: right; white-space: nowrap; }
`;

export function reportHtml(opts: {
  title: string; subtitle: string; reportType: string; body: string;
  footerNote?: string; companyName?: string; headerImageB64?: string; footerImageB64?: string;
}): string {
  const {
    title, subtitle, reportType, body,
    footerNote  = '',
    companyName = 'Bridge Technologies Solutions',
    headerImageB64, footerImageB64,
  } = opts;

  const now     = new Date();
  const genDate = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const genTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const refId   = `RPT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<style>${REPORT_CSS}</style>
</head>
<body>
  <div class="page-header">${headerImageB64 ? `<img src="${headerImageB64}" alt=""/>` : ''}</div>
  <div class="page-footer">${footerImageB64 ? `<img src="${footerImageB64}" alt=""/>` : ''}</div>
  <div class="page-content">
    <div class="report-header">
      <div class="report-header-left">
        <span class="report-badge">${reportType}</span>
        <h1 class="report-title">${title}</h1>
        <div class="report-period">${subtitle}</div>
      </div>
      <div class="report-header-right">
        ${headerImageB64 ? '' : `<div class="company-name">${companyName}</div>`}
        <div class="report-generated">Généré le ${genDate} à ${genTime}</div>
        <div class="report-ref">${refId}</div>
      </div>
    </div>
    ${body}
    <div class="report-footer">
      <div class="report-footer-note">${footerNote || `Document établi par ${companyName} — Douala, Cameroun. Confidentialité : usage interne uniquement.`}</div>
      <div class="report-footer-brand">InvoiceHub v2.0<br/>SYSCOHADA révisé</div>
    </div>
  </div>
</body>
</html>`;
}
