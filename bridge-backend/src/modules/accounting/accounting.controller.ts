import { Request, Response, NextFunction } from 'express';
import * as service from './accounting.service';
import {
  createChartAccountSchema, updateChartAccountSchema,
  createFiscalPeriodSchema, createJournalSchema,
  createJournalEntrySchema, updateJournalEntrySchema, createTaxDeclarationSchema,
  manualLetteringSchema, deleteLetteringSchema, unletteredLinesSchema,
} from './accounting.schema';

function pagination(req: Request) {
  return {
    page: Math.max(1, parseInt(String(req.query['page'] ?? '1'))),
    limit: Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20')))),
  };
}

// ── Lettrage manuel ─────────────────────────────────────────────────────────────

export async function letterLines(req: Request, res: Response, next: NextFunction) {
  try {
    const input = manualLetteringSchema.parse(req.body);
    await service.letterLines(input, req.user!.id);
    res.json({ success: true, message: 'Lettrage effectué avec succès' });
  } catch (err) { next(err); }
}

export async function deleteLettering(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = req.params as { code: string };
    const { accountNumber } = deleteLetteringSchema.parse(req.body);
    await service.deleteLettering(code, accountNumber);
    res.json({ success: true, message: 'Lettrage supprimé' });
  } catch (err) { next(err); }
}

export async function getUnletteredLines(req: Request, res: Response, next: NextFunction) {
  try {
    const input = unletteredLinesSchema.parse(req.query);
    const data = await service.getUnletteredLines(input);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

// ── Plan comptable ─────────────────────────────────────────────────────────────

export async function getChart(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getChartOfAccounts({
      search: req.query['search'] as string | undefined,
      accountClass: req.query['accountClass'] as string | undefined,
      isActive: req.query['isActive'] === 'false' ? false : req.query['isActive'] === 'true' ? true : undefined,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function addChartAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createChartAccountSchema.parse(req.body);
    const data = await service.createChartAccount(input);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateChartAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateChartAccountSchema.parse(req.body);
    const data = await service.updateChartAccount(String(req.params['accountNumber']), input);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Périodes ──────────────────────────────────────────────────────────────────

export async function listPeriods(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listFiscalPeriods();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getFiscalPeriodById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createFiscalPeriodSchema.parse(req.body);
    const data = await service.createFiscalPeriod(input);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function closePeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.closeFiscalPeriod(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function lockPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.lockFiscalPeriod(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Journaux ──────────────────────────────────────────────────────────────────

export async function listJournals(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listJournals();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getJournal(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getJournalById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createJournal(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createJournalSchema.parse(req.body);
    const data = await service.createJournal(input);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Écritures ─────────────────────────────────────────────────────────────────

export async function listEntries(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.listEntries({
      page, limit,
      journalId:      req.query['journalId']      as string | undefined,
      fiscalPeriodId: req.query['fiscalPeriodId'] as string | undefined,
      status:         req.query['status']         as string | undefined,
      search:         req.query['search']         as string | undefined,
      dateFrom:       req.query['dateFrom']       as string | undefined,
      dateTo:         req.query['dateTo']         as string | undefined,
    });
    res.json({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function getEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getEntryById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createJournalEntrySchema.parse(req.body);
    const data = await service.createJournalEntry(input, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function validateEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.validateEntry(String(req.params['id']), req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function lockEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.lockEntry(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateJournalEntrySchema.parse(req.body);
    const data = await service.updateJournalEntry(String(req.params['id']), input);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteEntry(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteJournalEntry(String(req.params['id']));
    res.json({ success: true, message: 'Écriture supprimée' });
  } catch (err) { next(err); }
}

export async function reverseEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.reverseEntry(String(req.params['id']), req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function exportBalancePdf(req: Request, res: Response, next: NextFunction) {
  try {
    const pdf = await service.exportBalancePdf(req.query['periodId'] as string | undefined);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="balance.pdf"');
    res.send(pdf);
  } catch (err) { next(err); }
}

// ── Rapports ──────────────────────────────────────────────────────────────────

export async function getBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getAccountBalance({
      fiscalPeriodId: req.query['fiscalPeriodId'] as string | undefined,
      accountClass:   req.query['accountClass']   as string | undefined,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getAccountLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { account, lines, total } = await service.getAccountLedger(String(req.params['accountNumber']), {
      page, limit,
      fiscalPeriodId: req.query['periodId'] as string | undefined,
    });
    res.json({ success: true, data: { account, lines }, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function exportSage(req: Request, res: Response, next: NextFunction) {
  try {
    const csv = await service.exportSageCsv(req.query['periodId'] as string | undefined);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="export-sage.csv"');
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
}

// ── Déclarations fiscales ──────────────────────────────────────────────────────

export async function listDeclarations(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.listTaxDeclarations({
      page, limit,
      declarationType: req.query['type'] as string | undefined,
    });
    res.json({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function createDeclaration(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createTaxDeclarationSchema.parse(req.body);
    const data = await service.createTaxDeclaration(input, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getDeclaration(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getTaxDeclarationById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function submitDeclaration(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.submitTaxDeclaration(String(req.params['id']), req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
