import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AccountingService } from './accounting.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createChartAccountSchema, updateChartAccountSchema,
  createFiscalPeriodSchema,
  createJournalSchema, updateJournalSchema,
  createJournalEntrySchema, updateJournalEntrySchema,
  createTaxDeclarationSchema,
  manualLetteringSchema, deleteLetteringSchema,
} from './accounting.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@Controller('accounting')
export class AccountingController {
  constructor(private readonly svc: AccountingService) {}

  // ── Plan comptable ──────────────────────────────────────────────────────────

  @Get('accounts')
  @Permission('accounting:read')
  listAccounts(
    @Query('search')  search?: string,
    @Query('class')   accountClass?: string,
    @Query('active')  active?: string,
  ) {
    return this.svc.getChartOfAccounts({
      search,
      accountClass,
      isActive: active === undefined ? undefined : active === 'true',
    });
  }

  @Post('accounts')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.CREATED)
  createAccount(
    @Body(new ZodValidationPipe(createChartAccountSchema)) body: any,
  ) {
    return this.svc.createChartAccount(body);
  }

  @Get('accounts/:id')
  @Permission('accounting:read')
  getAccount(@Param('id') id: string) {
    return this.svc.getChartAccountById(id);
  }

  @Put('accounts/:id')
  @Permission('accounting:write')
  updateAccount(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateChartAccountSchema)) body: any,
  ) {
    return this.svc.updateChartAccount(id, body);
  }

  @Delete('accounts/:id')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.OK)
  deleteAccount(@Param('id') id: string) {
    return this.svc.deleteChartAccount(id);
  }

  // ── Périodes fiscales ───────────────────────────────────────────────────────

  @Get('fiscal-years')
  @Permission('accounting:read')
  listFiscalYears() {
    return this.svc.listFiscalPeriods();
  }

  @Post('fiscal-years')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.CREATED)
  createFiscalYear(
    @Body(new ZodValidationPipe(createFiscalPeriodSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createFiscalPeriod(body);
  }

  @Get('periods/:id')
  @Permission('accounting:read')
  getPeriod(@Param('id') id: string) {
    return this.svc.getFiscalPeriodById(id);
  }

  @Post('periods/:id/close')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.OK)
  closePeriod(@Param('id') id: string) {
    return this.svc.closeFiscalPeriod(id);
  }

  @Post('periods/:id/reopen')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.OK)
  reopenPeriod(@Param('id') id: string) {
    return this.svc.reopenFiscalPeriod(id);
  }

  // ── Journaux ────────────────────────────────────────────────────────────────

  @Get('journals')
  @Permission('accounting:read')
  listJournals() {
    return this.svc.listJournals();
  }

  @Post('journals')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.CREATED)
  createJournal(
    @Body(new ZodValidationPipe(createJournalSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createJournal(body, user.sub);
  }

  @Put('journals/:id')
  @Permission('accounting:write')
  updateJournal(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateJournalSchema)) body: any,
  ) {
    return this.svc.updateJournal(id, body);
  }

  @Delete('journals/:id')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.OK)
  deleteJournal(@Param('id') id: string) {
    return this.svc.deleteJournal(id);
  }

  // ── Écritures comptables ────────────────────────────────────────────────────

  @Get('entries')
  @Permission('accounting:read')
  listEntries(
    @Query('page')          page          = '1',
    @Query('limit')         limit         = '20',
    @Query('journalId')     journalId?: string,
    @Query('periodId')      periodId?: string,
    @Query('status')        status?: string,
    @Query('search')        search?: string,
    @Query('dateFrom')      dateFrom?: string,
    @Query('dateTo')        dateTo?: string,
  ) {
    return this.svc.listEntries({
      page:          parseInt(page,  10),
      limit:         parseInt(limit, 10),
      journalId,
      fiscalPeriodId: periodId,
      status,
      search,
      dateFrom,
      dateTo,
    });
  }

  @Post('entries')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.CREATED)
  createEntry(
    @Body(new ZodValidationPipe(createJournalEntrySchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createJournalEntry(body, user.sub);
  }

  @Get('entries/:id')
  @Permission('accounting:read')
  getEntry(@Param('id') id: string) {
    return this.svc.getEntryById(id);
  }

  @Put('entries/:id')
  @Permission('accounting:write')
  updateEntry(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateJournalEntrySchema)) body: any,
  ) {
    return this.svc.updateJournalEntry(id, body);
  }

  @Post('entries/:id/validate')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.OK)
  validateEntry(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.validateEntry(id, user.sub);
  }

  // Validation en masse d'une sélection d'écritures (workflow DAF)
  @Post('entries/validate-bulk')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.OK)
  validateEntriesBulk(
    @Body() body: { ids: string[] },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.validateEntries(body?.ids ?? [], user.sub);
  }

  // Valider toutes les écritures brouillon d'une période/journal/intervalle
  @Post('entries/validate-all')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.OK)
  validateAllDraft(
    @Body() body: { periodId?: string; journalId?: string; dateFrom?: string; dateTo?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.validateAllDraftEntries(
      { fiscalPeriodId: body?.periodId, journalId: body?.journalId, dateFrom: body?.dateFrom, dateTo: body?.dateTo },
      user.sub,
    );
  }

  // Résumé des écritures en attente de validation (pour le dashboard / badge)
  @Get('entries-pending')
  @Permission('accounting:read')
  pendingValidation(@Query('periodId') periodId?: string) {
    return this.svc.getPendingValidationSummary(periodId);
  }

  @Post('entries/:id/cancel')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.OK)
  cancelEntry(@Param('id') id: string) {
    return this.svc.cancelEntry(id);
  }

  @Post('entries/:id/reverse')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.CREATED)
  reverseEntry(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.reverseEntry(id, user.sub);
  }

  // ── Rapports ────────────────────────────────────────────────────────────────

  @Get('reports/balance')
  @Permission('accounting:read')
  getBalance(
    @Query('periodId')    periodId?: string,
    @Query('class')       accountClass?: string,
  ) {
    return this.svc.getAccountBalance({ fiscalPeriodId: periodId, accountClass });
  }

  @Get('reports/ledger')
  @Permission('accounting:read')
  getLedger(
    @Query('accountNumber') accountNumber?: string,
    @Query('periodId')      periodId?: string,
    @Query('page')          page  = '1',
    @Query('limit')         limit = '50',
    @Query('includeDraft')  includeDraft?: string,
  ) {
    if (!accountNumber) return [];
    return this.svc.getAccountLedger(accountNumber, {
      page:          parseInt(page,  10),
      limit:         parseInt(limit, 10),
      fiscalPeriodId: periodId,
      includeDraft:  includeDraft === 'true',
    });
  }

  @Post('reports/export')
  @Permission('accounting:read')
  async exportSage(
    @Body() body: { dateFrom?: string; dateTo?: string; journals?: string[]; format?: string; encoding?: string; periodId?: string },
    @Res() res: Response,
  ) {
    const csv = await this.svc.exportSageCsv({ dateFrom: body.dateFrom, dateTo: body.dateTo, journals: body.journals, periodId: body.periodId });
    const charset = body.encoding === 'latin-1' ? 'latin-1' : 'utf-8';
    res.setHeader('Content-Type', `text/csv; charset=${charset}`);
    res.setHeader('Content-Disposition', 'attachment; filename="export-sage.csv"');
    res.send('﻿' + csv);
  }

  @Get('stats')
  @Permission('accounting:read')
  getStats() {
    return this.svc.getAccountingStats();
  }

  // ── États financiers SYSCOHADA ───────────────────────────────────────────────

  @Get('reports/bilan')
  @Permission('accounting:read')
  getBilan(
    @Query('periodId') periodId?: string,
    @Query('year')     year?: string,
  ) {
    return this.svc.getBilan({ fiscalPeriodId: periodId, fiscalYear: year ? parseInt(year, 10) : undefined });
  }

  @Get('reports/compte-resultat')
  @Permission('accounting:read')
  getCompteResultat(
    @Query('periodId') periodId?: string,
    @Query('year')     year?: string,
  ) {
    return this.svc.getCompteResultat({ fiscalPeriodId: periodId, fiscalYear: year ? parseInt(year, 10) : undefined });
  }

  // ── Lettrage ────────────────────────────────────────────────────────────────

  @Get('lettering')
  @Permission('accounting:read')
  async getLetterableLines(
    @Query('accountId') accountNumber?: string,
    @Query('periodId')  periodId?: string,
    @Query('dateFrom')  dateFrom?: string,
    @Query('dateTo')    dateTo?: string,
  ) {
    if (!accountNumber) return { unlettered: [], lettered: [] };
    const [unletteredResult, letteredGroups] = await Promise.all([
      this.svc.getUnletteredLines({
        accountNumber,
        dateFrom,
        dateTo,
        page:  1,
        limit: 200,
      }),
      this.svc.getLeteredGroups(accountNumber, dateFrom, dateTo),
    ]);
    return { unlettered: unletteredResult.data ?? [], lettered: letteredGroups };
  }

  @Post('lettering')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.OK)
  async letterLines(
    @Body() body: { lineIds: string[]; accountNumber?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.letterLinesAuto(body.lineIds, user.sub);
  }

  @Delete('lettering/:code')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.OK)
  deleteLettering(
    @Param('code') code: string,
    @Query('accountNumber') accountNumber?: string,
  ) {
    return this.svc.deleteLettering(code, accountNumber ?? '');
  }

  // ── Déclarations fiscales ───────────────────────────────────────────────────

  @Get('tax-declarations')
  @Permission('accounting:read')
  listTaxDeclarations(
    @Query('page')   page  = '1',
    @Query('limit')  limit = '20',
    @Query('type')   type?: string,
  ) {
    return this.svc.listTaxDeclarations({
      page:            parseInt(page,  10),
      limit:           parseInt(limit, 10),
      declarationType: type,
    });
  }

  @Post('tax-declarations')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.CREATED)
  createTaxDeclaration(
    @Body(new ZodValidationPipe(createTaxDeclarationSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createTaxDeclaration(body, user.sub);
  }

  @Get('tax-declarations/:id')
  @Permission('accounting:read')
  getTaxDeclaration(@Param('id') id: string) {
    return this.svc.getTaxDeclarationById(id);
  }

  @Post('tax-declarations/:id/submit')
  @Permission('accounting:write')
  @HttpCode(HttpStatus.OK)
  submitTaxDeclaration(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.submitTaxDeclaration(id, user.sub);
  }
}
