import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { logger } from '../../core/middleware/requestLogger';
import { ExportJobData } from '../queues';
import path from 'path';
import fs from 'fs/promises';

const EXPORTS_DIR = path.join(process.cwd(), 'exports');

async function ensureExportsDir() {
  await fs.mkdir(EXPORTS_DIR, { recursive: true });
}

// ── Helpers de données ────────────────────────────────────────────────────────

async function fetchEntityData(module: string, filters: Record<string, unknown>) {
  const deletedAt = null;
  switch (module) {
    case 'invoices':
      return prisma.invoice.findMany({
        where: { deletedAt, ...filters },
        include: { client: { select: { name: true } }, lines: true },
        orderBy: { createdAt: 'desc' },
        take: 10_000,
      });
    case 'payments':
      return prisma.payment.findMany({
        where: { deletedAt, ...filters },
        include: { invoice: { select: { number: true } } },
        orderBy: { paymentDate: 'desc' },
        take: 10_000,
      });
    case 'clients':
      return prisma.client.findMany({
        where: { deletedAt, ...filters },
        orderBy: { name: 'asc' },
        take: 10_000,
      });
    case 'expenses':
      return prisma.expense.findMany({
        where: { deletedAt, ...filters },
        include: { category: { select: { name: true } } },
        orderBy: { expenseDate: 'desc' },
        take: 10_000,
      });
    case 'suppliers':
      return prisma.supplier.findMany({
        where: { deletedAt, ...filters },
        orderBy: { name: 'asc' },
        take: 10_000,
      });
    case 'journal_entries':
      return prisma.journalEntry.findMany({
        where: { ...filters },
        include: { lines: true, journal: { select: { code: true, name: true } } },
        orderBy: { entryDate: 'desc' },
        take: 10_000,
      });
    default:
      return [];
  }
}

// ── Formats d'export ──────────────────────────────────────────────────────────

function flattenRow(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}_${k}` : k;
    if (v === null || v === undefined) {
      flat[key] = '';
    } else if (typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      Object.assign(flat, flattenRow(v as Record<string, unknown>, key));
    } else if (Array.isArray(v)) {
      flat[key] = JSON.stringify(v);
    } else if (v instanceof Date) {
      flat[key] = v.toISOString();
    } else {
      flat[key] = String(v);
    }
  }
  return flat;
}

async function generateCsv(data: object[], filePath: string): Promise<void> {
  if (data.length === 0) { await fs.writeFile(filePath, 'Aucune donnée\n', 'utf-8'); return; }
  const rows    = data.map(r => flattenRow(r as Record<string, unknown>));
  const headers = Object.keys(rows[0]!);
  const lines   = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${(r[h] ?? '').replace(/"/g, '""')}"`).join(',')),
  ];
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
}

async function generateExcel(data: object[], filePath: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet    = workbook.addWorksheet('Export');
    if (data.length === 0) {
      sheet.addRow(['Aucune donnée']);
    } else {
      const rows    = data.map(r => flattenRow(r as Record<string, unknown>));
      const headers = Object.keys(rows[0]!);
      sheet.addRow(headers);
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D7DD2' } };
      for (const row of rows) sheet.addRow(headers.map(h => row[h] ?? ''));
      sheet.columns.forEach((col: { width: number }) => { col.width = 18; });
    }
    await workbook.xlsx.writeFile(filePath);
  } catch {
    await generateCsv(data, filePath.replace('.xlsx', '.csv'));
  }
}

async function generateSageCsv(data: object[], filePath: string, module: string): Promise<void> {
  const BOM = '\uFEFF';
  if (module === 'journal_entries') {
    const entries = data as Array<{
      entryNumber: string; entryDate: Date | string; label: string;
      journal: { code: string };
      lines: Array<{ accountNumber: string; label: string; debit: number; credit: number }>;
    }>;
    const csvLines = ['Journal;Date;Numero;Libelle;Compte;LibelleCompte;Debit;Credit'];
    for (const entry of entries) {
      for (const line of entry.lines) {
        csvLines.push([
          entry.journal?.code ?? '',
          new Date(entry.entryDate).toLocaleDateString('fr-FR'),
          entry.entryNumber,
          entry.label,
          line.accountNumber,
          line.label,
          String(line.debit),
          String(line.credit),
        ].join(';'));
      }
    }
    await fs.writeFile(filePath, BOM + csvLines.join('\n'), 'utf-8');
    return;
  }
  const rows    = data.map(r => flattenRow(r as Record<string, unknown>));
  const headers = Object.keys(rows[0] ?? {});
  const lines   = [headers.join(';'), ...rows.map(r => headers.map(h => r[h] ?? '').join(';'))];
  await fs.writeFile(filePath, BOM + lines.join('\n'), 'utf-8');
}

async function generateDsfXml(data: object[], filePath: string): Promise<void> {
  const now     = new Date().toISOString();
  const invoices = data as Array<{
    number: string; issueDate: Date | string; totalTtc: number;
    totalTax: number; totalHt: number; client: { name: string } | null;
  }>;
  const lines = invoices.map(inv => `
    <Facture>
      <Numero>${inv.number ?? ''}</Numero>
      <Date>${new Date(inv.issueDate).toISOString().split('T')[0]}</Date>
      <Client>${(inv.client?.name ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Client>
      <MontantHT>${Number(inv.totalHt).toFixed(0)}</MontantHT>
      <TVA>${Number(inv.totalTax).toFixed(0)}</TVA>
      <MontantTTC>${Number(inv.totalTtc).toFixed(0)}</MontantTTC>
    </Facture>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DSF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" generated="${now}">
  <Entete>
    <SocieteNom>Bridge Technologies Solutions</SocieteNom>
    <Devise>XAF</Devise>
    <DateGeneration>${now.split('T')[0]}</DateGeneration>
  </Entete>
  <Factures>${lines}
  </Factures>
</DSF>`;
  await fs.writeFile(filePath, xml, 'utf-8');
}

// ── Processor principal ───────────────────────────────────────────────────────

export async function processExportJob(job: Job<ExportJobData>): Promise<void> {
  const { exportJobId } = job.data;

  const exportJob = await prisma.exportJob.findUnique({ where: { id: exportJobId } });
  if (!exportJob) {
    logger.warn(`[ExportProcessor] exportJob ${exportJobId} introuvable`);
    return;
  }

  await prisma.exportJob.update({
    where: { id: exportJobId },
    data:  { status: 'running', startedAt: new Date(), progress: 5 },
  });

  try {
    await ensureExportsDir();

    const filters = (exportJob.filters ?? {}) as Record<string, unknown>;
    const data    = await fetchEntityData(exportJob.module, filters);

    const ext = exportJob.format === 'excel'   ? 'xlsx'
              : exportJob.format === 'dsf_xml'  ? 'xml'
              : exportJob.format === 'ciel_csv' ? 'txt'
              : 'csv';

    const filename = `export_${exportJob.module}_${Date.now()}.${ext}`;
    const filePath = path.join(EXPORTS_DIR, filename);

    switch (exportJob.format) {
      case 'excel':
        await generateExcel(data, filePath);
        break;
      case 'sage_csv':
        await generateSageCsv(data, filePath, exportJob.module);
        break;
      case 'ciel_csv':
        await generateSageCsv(data, filePath, exportJob.module);
        break;
      case 'dsf_xml':
        await generateDsfXml(data, filePath);
        break;
      case 'csv':
      default:
        await generateCsv(data, filePath);
    }

    const stat = await fs.stat(filePath);

    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status:       'completed',
        filePath:     `/exports/${filename}`,
        fileSizeBytes: stat.size,
        progress:     100,
        completedAt:  new Date(),
      },
    });

    logger.info(`[ExportProcessor] Export terminé`, { exportJobId, filename, records: data.length });
  } catch (err) {
    const error = err as Error;
    logger.error(`[ExportProcessor] Erreur`, { exportJobId, error: error.message });
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data:  { status: 'failed', errorMessage: error.message },
    });
    throw err;
  }
}
