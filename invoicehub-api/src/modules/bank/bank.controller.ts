// src/modules/bank/bank.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UploadedFile,
  UseInterceptors, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BankService } from './bank.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createBankAccountSchema, updateBankAccountSchema,
  createTransactionSchema, reconcileTransactionSchema,
  openReconciliationSchema,
  detectFormatSchema, previewImportSchema, confirmImportSchema, saveProfileOverrideSchema,
  createImportProfileSchema, updateImportProfileSchema,
  createMatchingRuleSchema, updateMatchingRuleSchema,
} from './bank.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { AppError } from '../../common/errors/app-error';

// Extensions de relevé acceptées : on rejette tout le reste AVANT de bufferiser
// le fichier en mémoire (un binaire de 5 Mo n'a rien à faire dans le parser).
const ALLOWED_IMPORT_EXT = ['csv', 'txt', 'ofx', 'qfx', 'sta', 'mt940'];
const fileUpload = {
  storage: memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => {
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    cb(null, ALLOWED_IMPORT_EXT.includes(ext));
  },
};

@Controller('bank')
export class BankController {
  constructor(private readonly bank: BankService) {}

  // ── Résumé ──────────────────────────────────────────────────────────────────

  @Get('summary')
  @Permission('bank:read')
  async getBankSummary() {
    return this.bank.getBankSummary();
  }

  // ── Comptes ─────────────────────────────────────────────────────────────────

  @Get('accounts')
  @Permission('bank:read')
  async listAccounts() {
    return this.bank.listAccounts();
  }

  @Post('accounts')
  @Permission('bank:manage')
  @Audit('bank_account', 'CREATE')
  @HttpCode(HttpStatus.CREATED)
  async createAccount(
    @Body(new ZodValidationPipe(createBankAccountSchema)) body: any,
  ) {
    return this.bank.createAccount(body);
  }

  @Get('accounts/:id/import-config')
  @Permission('bank:read')
  async getImportConfig(@Param('id') id: string) {
    return this.bank.getImportConfig(id);
  }

  @Get('accounts/:id')
  @Permission('bank:read')
  async getAccount(@Param('id') id: string) {
    return this.bank.getAccountById(id);
  }

  @Put('accounts/:id')
  @Permission('bank:manage')
  @Audit('bank_account', 'UPDATE')
  async updateAccount(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBankAccountSchema)) body: any,
  ) {
    return this.bank.updateAccount(id, body);
  }

  @Delete('accounts/:id')
  @Permission('bank:manage')
  @Audit('bank_account', 'DELETE')
  async deleteAccount(@Param('id') id: string) {
    await this.bank.deleteAccount(id);
    return { message: 'Compte bancaire supprimé' };
  }

  // ── Transactions ─────────────────────────────────────────────────────────────

  @Get('transactions/:id/suggestions')
  @Permission('bank:read')
  async getSuggestions(@Param('id') id: string) {
    return this.bank.getSuggestions(id);
  }

  @Get('transactions/:id/subset-matches')
  @Permission('bank:read')
  async getSubsetMatches(@Param('id') id: string) {
    return this.bank.findSubsetMatches(id);
  }

  @Post('transactions/:id/reconcile')
  @Permission('bank:reconcile')
  @Audit('bank_transaction', 'RECONCILED')
  async reconcileTransaction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reconcileTransactionSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.reconcileTransaction(id, body, user.sub);
  }

  @Post('transactions/:id/unmatch')
  @Permission('bank:reconcile')
  @Audit('bank_transaction', 'STATUS_CHANGE')
  async unmatchTransaction(@Param('id') id: string) {
    return this.bank.unmatchTransaction(id);
  }

  @Post('transactions/:id/ignore')
  @Permission('bank:reconcile')
  @Audit('bank_transaction', 'STATUS_CHANGE')
  async ignoreTransaction(@Param('id') id: string) {
    return this.bank.ignoreTransaction(id);
  }

  // Crée la contrepartie comptable d'un mouvement de frais bancaire / agios
  // (dépense payée + écriture SYSCOHADA + rapprochement). Sur confirmation
  // explicite ; `allowOverCeiling` force au-delà du plafond de sécurité.
  @Post('transactions/:id/create-fee-expense')
  @Permission('bank:reconcile')
  @Audit('bank_transaction', 'RECONCILED')
  async createFeeCounterpart(
    @Param('id') id: string,
    @Body() body: { taxRate?: number; account?: string; categoryName?: string; allowOverCeiling?: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.createFeeCounterpart(id, user.sub, body ?? {});
  }

  @Get('transactions')
  @Permission('bank:read')
  @SkipResponseWrapper()
  async listTransactions(
    @Query('page')       page       = '1',
    @Query('limit')      limit      = '20',
    @Query('accountId')  accountId?: string,
    @Query('type')       type?:      string,
    @Query('dateFrom')   dateFrom?:  string,
    @Query('dateTo')     dateTo?:    string,
    @Query('reconciled') reconciledStr?: string,
    @Query('status')     status?:    string,
    @Query('search')     search?:    string,
  ) {
    const p         = Math.max(1, parseInt(page));
    const l         = Math.min(100, Math.max(1, parseInt(limit)));
    const reconciled = reconciledStr === 'true' ? true : reconciledStr === 'false' ? false : undefined;
    const { data, total } = await this.bank.listTransactions({ page: p, limit: l, accountId, type, dateFrom, dateTo, reconciled, status, search });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Post('transactions')
  @Permission('bank:manage')
  @Audit('bank_transaction', 'CREATE')
  @HttpCode(HttpStatus.CREATED)
  async createTransaction(
    @Body(new ZodValidationPipe(createTransactionSchema)) body: any,
  ) {
    return this.bank.createTransaction(body);
  }

  @Get('transactions/:id')
  @Permission('bank:read')
  async getTransaction(@Param('id') id: string) {
    return this.bank.getTransactionById(id);
  }

  // Suppression d'une saisie manuelle (rétablit le solde). Refuse les mouvements
  // importés et les transactions rapprochées.
  @Delete('transactions/:id')
  @Permission('bank:manage')
  @Audit('bank_transaction', 'DELETE')
  async deleteTransaction(@Param('id') id: string) {
    return this.bank.deleteTransaction(id);
  }

  // ── Rapprochements ───────────────────────────────────────────────────────────

  @Get('reconciliations/:id/report')
  @Permission('bank:read')
  async getReconciliationReport(@Param('id') id: string) {
    return this.bank.getReconciliationReport(id);
  }

  @Post('reconciliations/:id/auto-match')
  @Permission('bank:auto-match')
  @Audit('bank_reconciliation', 'RECONCILED')
  // Applique les correspondances ≥ 90 % et renvoie les 70–89 % à confirmer.
  // `applyHighConfidence` du corps n'est plus lu : les 70–89 % ne sont plus
  // jamais appliquées automatiquement.
  async autoMatch(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.getAutoMatchBatch(id, user.sub);
  }

  @Post('reconciliations/:id/complete')
  @Permission('bank:reconcile')
  @Audit('bank_reconciliation', 'STATUS_CHANGE')
  async completeReconciliation(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('force') force?: string,
  ) {
    return this.bank.completeReconciliation(id, user.sub, force === 'true');
  }

  @Get('reconciliations')
  @Permission('bank:read')
  @SkipResponseWrapper()
  async listReconciliations(
    @Query('page')      page      = '1',
    @Query('limit')     limit     = '20',
    @Query('accountId') accountId?: string,
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const { data, total } = await this.bank.listReconciliations({ page: p, limit: l, accountId });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Post('reconciliations')
  @Permission('bank:reconcile')
  @Audit('bank_reconciliation', 'CREATE')
  @HttpCode(HttpStatus.CREATED)
  async openReconciliation(
    @Body(new ZodValidationPipe(openReconciliationSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.openReconciliation(body, user.sub);
  }

  @Get('reconciliations/:id')
  @Permission('bank:read')
  async getReconciliation(@Param('id') id: string) {
    return this.bank.getReconciliationById(id);
  }

  // ── Import — nouveau pipeline ────────────────────────────────────────────────

  @Post('import/detect')
  @Permission('bank:import-parse')
  @UseInterceptors(FileInterceptor('file', fileUpload))
  async detectFormat(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(detectFormatSchema)) body: any,
  ) {
    if (!file) throw AppError.badRequest('Fichier requis (formats acceptés : CSV, TXT, OFX, QFX, MT940).');
    return this.bank.detectImportFormat(file.buffer, body.bankAccountId, file.originalname, body.encoding);
  }

  @Post('import/preview')
  @Permission('bank:import-parse')
  @UseInterceptors(FileInterceptor('file', fileUpload))
  async previewImport(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(previewImportSchema)) body: { bankAccountId: string; encoding?: string; columnMapping?: string },
  ) {
    if (!file) throw AppError.badRequest('Fichier requis (formats acceptés : CSV, TXT, OFX, QFX, MT940).');
    // Mapping manuel du ColumnMapper : un JSON invalide doit remonter une erreur
    // claire, pas être avalé (sinon l'auto-détection reprend en silence et
    // l'utilisateur croit à tort que son mapping a été pris en compte).
    let columnMappingOverride: object | undefined;
    if (body.columnMapping) {
      try {
        columnMappingOverride = JSON.parse(body.columnMapping);
      } catch {
        throw AppError.badRequest('Le mapping de colonnes est invalide (JSON malformé).', 'INVALID_COLUMN_MAPPING');
      }
    }
    return this.bank.previewImport(file.buffer, body.bankAccountId, file.originalname, body.encoding as any, undefined, columnMappingOverride);
  }

  @Post('import/confirm')
  @Permission('bank:import-confirm')
  @Audit('bank_statement_import', 'CREATE')
  async confirmImport(
    @Body(new ZodValidationPipe(confirmImportSchema)) body: { importId: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.confirmImport(body.importId, user.sub);
  }

  @Get('import/:id/status')
  @Permission('bank:import-confirm')
  async getImportStatus(@Param('id') id: string) {
    return this.bank.getImportStatus(id);
  }

  @Delete('import/:id')
  @Permission('bank:import-confirm')
  @Audit('bank_statement_import', 'DELETE')
  async rollbackImport(@Param('id') id: string) {
    return this.bank.rollbackImport(id);
  }

  @Get('imports')
  @Permission('bank:read')
  @SkipResponseWrapper()
  async listImports(
    @Query('page')  page  = '1',
    @Query('limit') limit = '20',
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const { data, total } = await this.bank.listImports(p, l);
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  // ── Profils — override par compte ───────────────────────────────────────────

  @Post('profiles/override')
  @Permission('bank:import-parse')
  async saveProfileOverride(
    @Body(new ZodValidationPipe(saveProfileOverrideSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.saveProfileOverride(body.bankAccountId, body.profileData, user.sub);
  }

  // ── Profils d'import partagés ────────────────────────────────────────────────

  @Get('import-profiles')
  @Permission('bank:read')
  async listImportProfiles(@CurrentUser() user: JwtPayload) {
    return this.bank.listImportProfiles(user.sub);
  }

  @Post('import-profiles')
  @Permission('bank:import-parse')
  @HttpCode(HttpStatus.CREATED)
  async createImportProfile(
    @Body(new ZodValidationPipe(createImportProfileSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.createImportProfile(body, user.sub);
  }

  @Get('import-profiles/:id')
  @Permission('bank:read')
  async getImportProfile(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bank.getImportProfileById(id, user.sub);
  }

  @Put('import-profiles/:id')
  @Permission('bank:manage')
  async updateImportProfile(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateImportProfileSchema)) body: any,
  ) {
    return this.bank.updateImportProfile(id, body);
  }

  @Delete('import-profiles/:id')
  @Permission('bank:manage')
  async deleteImportProfile(@Param('id') id: string) {
    await this.bank.deleteImportProfile(id);
    return { message: 'Profil d\'import supprimé' };
  }

  @Post('import-profiles/:id/use')
  @Permission('bank:import-parse')
  async incrementImportProfileUsage(@Param('id') id: string) {
    await this.bank.incrementImportProfileUsage(id);
    return { message: 'Usage enregistré' };
  }

  // ── Règles de matching ───────────────────────────────────────────────────────

  @Get('matching-rules')
  @Permission('bank:read')
  async listMatchingRules(@Query('bankAccountId') bankAccountId?: string) {
    return this.bank.listMatchingRules(bankAccountId);
  }

  @Post('matching-rules')
  @Permission('bank:rules')
  @Audit('bank_matching_rule', 'CREATE')
  @HttpCode(HttpStatus.CREATED)
  async createMatchingRule(
    @Body(new ZodValidationPipe(createMatchingRuleSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.createMatchingRule(body, user.sub);
  }

  @Put('matching-rules/:id')
  @Permission('bank:rules')
  @Audit('bank_matching_rule', 'UPDATE')
  async updateMatchingRule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMatchingRuleSchema)) body: any,
  ) {
    return this.bank.updateMatchingRule(id, body);
  }

  @Delete('matching-rules/:id')
  @Permission('bank:rules')
  @Audit('bank_matching_rule', 'DELETE')
  async deleteMatchingRule(@Param('id') id: string) {
    await this.bank.deleteMatchingRule(id);
    return { message: 'Règle désactivée' };
  }
}
