import { Request, Response, NextFunction } from 'express';
import * as service from './bank.service';
import {
  createBankAccountSchema, updateBankAccountSchema,
  createTransactionSchema, reconcileTransactionSchema,
  openReconciliationSchema, importCsvSchema,
  detectFormatSchema, confirmImportSchema, saveProfileOverrideSchema,
} from './bank.schema';

function pagination(req: Request) {
  return {
    page: Math.max(1, parseInt(String(req.query['page'] ?? '1'))),
    limit: Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20')))),
  };
}

// ── Résumé ────────────────────────────────────────────────────────────────────

export async function getBankSummary(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getBankSummary();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Comptes ───────────────────────────────────────────────────────────────────

export async function listAccounts(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listAccounts();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getAccountById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createBankAccountSchema.parse(req.body);
    const data = await service.createAccount(input);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateBankAccountSchema.parse(req.body);
    const data = await service.updateAccount(String(req.params['id']), input);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteAccount(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteAccount(String(req.params['id']));
    res.json({ success: true, message: 'Compte bancaire supprimé' });
  } catch (err) { next(err); }
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function listTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.listTransactions({
      page, limit,
      accountId:  req.query['accountId']  as string | undefined,
      type:       req.query['type']       as string | undefined,
      dateFrom:   req.query['dateFrom']   as string | undefined,
      dateTo:     req.query['dateTo']     as string | undefined,
      search:     req.query['search']     as string | undefined,
      reconciled: req.query['reconciled'] === 'true' ? true
        : req.query['reconciled'] === 'false' ? false : undefined,
    });
    res.json({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function getTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getTransactionById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createTransactionSchema.parse(req.body);
    const data = await service.createTransaction(input);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getSuggestions(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getSuggestions(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function reconcileTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const input = reconcileTransactionSchema.parse(req.body);
    const data = await service.reconcileTransaction(String(req.params['id']), input, req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function unmatchTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.unmatchTransaction(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function ignoreTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.ignoreTransaction(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Import CSV (ancien — rétrocompat) ─────────────────────────────────────────

export async function importCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw { statusCode: 400, message: 'Fichier CSV requis' };

    const csvContent = file.buffer.toString('utf-8');
    const params     = importCsvSchema.parse(req.body);
    const data       = await service.importCsv(csvContent, params, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Nouveau pipeline import ───────────────────────────────────────────────────

export async function detectFormat(req: Request, res: Response, next: NextFunction) {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw { statusCode: 400, message: 'Fichier requis' };
    const { bankAccountId, encoding } = detectFormatSchema.parse(req.body);
    const data = await service.detectImportFormat(file.buffer, bankAccountId, file.originalname, encoding as any);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function previewImport(req: Request, res: Response, next: NextFunction) {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw { statusCode: 400, message: 'Fichier requis' };
    const { bankAccountId, encoding } = req.body;
    const data = await service.previewImport(
      file.buffer,
      bankAccountId,
      file.originalname,
      encoding as any
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function confirmImport(req: Request, res: Response, next: NextFunction) {
  try {
    const { importId } = confirmImportSchema.parse(req.body);
    const data = await service.confirmImport(importId, req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function rollbackImport(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.rollbackImport(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getImportStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getImportStatus(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getImportConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getImportConfig(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function saveProfileOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const { bankAccountId, profileData } = saveProfileOverrideSchema.parse(req.body);
    const data = await service.saveProfileOverride(bankAccountId, profileData as any, req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Subset matches ────────────────────────────────────────────────────────────

export async function getSubsetMatches(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.findSubsetMatches(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Auto-match Hungarian ──────────────────────────────────────────────────────

export async function autoMatch(req: Request, res: Response, next: NextFunction) {
  try {
    const apply = req.body?.applyHighConfidence === true;
    const data  = await service.getAutoMatchBatch(String(req.params['id']), apply);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Règles de matching CRUD ───────────────────────────────────────────────────

export async function listMatchingRules(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listMatchingRules(req.query['bankAccountId'] as string | undefined);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createMatchingRule(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createMatchingRule(req.body, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateMatchingRule(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateMatchingRule(String(req.params['id']), req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteMatchingRule(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteMatchingRule(String(req.params['id']));
    res.json({ success: true, message: 'Règle désactivée' });
  } catch (err) { next(err); }
}

// ── Rapprochements ────────────────────────────────────────────────────────────

export async function listReconciliations(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = pagination(req);
    const { data, total } = await service.listReconciliations({
      page, limit,
      accountId: req.query['accountId'] as string | undefined,
    });
    res.json({ success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
}

export async function getReconciliation(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getReconciliationById(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getReconciliationReport(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getReconciliationReport(String(req.params['id']));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function openReconciliation(req: Request, res: Response, next: NextFunction) {
  try {
    const input = openReconciliationSchema.parse(req.body);
    const data = await service.openReconciliation(input, req.user!.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function completeReconciliation(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.completeReconciliation(String(req.params['id']), req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
