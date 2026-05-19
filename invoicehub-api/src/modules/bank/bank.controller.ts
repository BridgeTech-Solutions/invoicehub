// src/modules/bank/bank.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UploadedFile,
  UseInterceptors, Header, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BankService } from './bank.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createBankAccountSchema, updateBankAccountSchema,
  createTransactionSchema, reconcileTransactionSchema,
  openReconciliationSchema, importCsvSchema,
  detectFormatSchema, confirmImportSchema, saveProfileOverrideSchema,
} from './bank.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { AppError } from '../../common/errors/app-error';

const fileUpload = { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } };

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
  async updateAccount(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBankAccountSchema)) body: any,
  ) {
    return this.bank.updateAccount(id, body);
  }

  @Delete('accounts/:id')
  @Permission('bank:manage')
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
  async reconcileTransaction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reconcileTransactionSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.reconcileTransaction(id, body, user.sub);
  }

  @Post('transactions/:id/unmatch')
  @Permission('bank:reconcile')
  async unmatchTransaction(@Param('id') id: string) {
    return this.bank.unmatchTransaction(id);
  }

  @Post('transactions/:id/ignore')
  @Permission('bank:reconcile')
  async ignoreTransaction(@Param('id') id: string) {
    return this.bank.ignoreTransaction(id);
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
    @Query('search')     search?:    string,
  ) {
    const p         = Math.max(1, parseInt(page));
    const l         = Math.min(100, Math.max(1, parseInt(limit)));
    const reconciled = reconciledStr === 'true' ? true : reconciledStr === 'false' ? false : undefined;
    const { data, total } = await this.bank.listTransactions({ page: p, limit: l, accountId, type, dateFrom, dateTo, reconciled, search });
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  @Post('transactions')
  @Permission('bank:manage')
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

  // ── Rapprochements ───────────────────────────────────────────────────────────

  @Get('reconciliations/:id/report')
  @Permission('bank:read')
  async getReconciliationReport(@Param('id') id: string) {
    return this.bank.getReconciliationReport(id);
  }

  @Post('reconciliations/:id/auto-match')
  @Permission('bank:auto-match')
  async autoMatch(
    @Param('id') id: string,
    @Body() body: { applyHighConfidence?: boolean },
  ) {
    return this.bank.getAutoMatchBatch(id, body?.applyHighConfidence === true);
  }

  @Post('reconciliations/:id/complete')
  @Permission('bank:reconcile')
  async completeReconciliation(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.completeReconciliation(id, user.sub);
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
    if (!file) throw AppError.badRequest('Fichier requis');
    return this.bank.detectImportFormat(file.buffer, body.bankAccountId, file.originalname, body.encoding);
  }

  @Post('import/preview')
  @Permission('bank:import-parse')
  @UseInterceptors(FileInterceptor('file', fileUpload))
  async previewImport(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { bankAccountId: string; encoding?: string },
  ) {
    if (!file) throw AppError.badRequest('Fichier requis');
    return this.bank.previewImport(file.buffer, body.bankAccountId, file.originalname, body.encoding as any);
  }

  @Post('import/confirm')
  @Permission('bank:import-confirm')
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
  async rollbackImport(@Param('id') id: string) {
    return this.bank.rollbackImport(id);
  }

  // Route dépréciée
  @Post('import')
  @Permission('bank:import-confirm')
  @Header('Deprecation', 'true')
  @Header('Sunset', '2026-12-31')
  @UseInterceptors(FileInterceptor('file', fileUpload))
  @HttpCode(HttpStatus.CREATED)
  async importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(importCsvSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw AppError.badRequest('Fichier CSV requis');
    const csvContent = file.buffer.toString('utf-8');
    return this.bank.importCsv(csvContent, body, user.sub);
  }

  // ── Profils ──────────────────────────────────────────────────────────────────

  @Post('profiles/override')
  @Permission('bank:import-parse')
  async saveProfileOverride(
    @Body(new ZodValidationPipe(saveProfileOverrideSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.saveProfileOverride(body.bankAccountId, body.profileData, user.sub);
  }

  // ── Règles de matching ───────────────────────────────────────────────────────

  @Get('matching-rules')
  @Permission('bank:read')
  async listMatchingRules(@Query('bankAccountId') bankAccountId?: string) {
    return this.bank.listMatchingRules(bankAccountId);
  }

  @Post('matching-rules')
  @Permission('bank:rules')
  @HttpCode(HttpStatus.CREATED)
  async createMatchingRule(
    @Body() body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bank.createMatchingRule(body, user.sub);
  }

  @Put('matching-rules/:id')
  @Permission('bank:rules')
  async updateMatchingRule(@Param('id') id: string, @Body() body: any) {
    return this.bank.updateMatchingRule(id, body);
  }

  @Delete('matching-rules/:id')
  @Permission('bank:rules')
  async deleteMatchingRule(@Param('id') id: string) {
    await this.bank.deleteMatchingRule(id);
    return { message: 'Règle désactivée' };
  }
}
