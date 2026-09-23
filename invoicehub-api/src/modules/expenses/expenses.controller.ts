import {
  Controller, Get, Post, Put, Delete, Res,
  Body, Param, Query, HttpCode, HttpStatus,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExpensesService } from './expenses.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createExpenseSchema, updateExpenseSchema, rejectExpenseSchema, payExpenseSchema,
  reimburseExpenseSchema,
} from './expenses.schema';
import type { PayExpenseInput } from './expenses.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import type { Response } from 'express';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @Get('stats')
  @Permission('expenses:read')
  async stats() {
    return this.svc.getExpenseStats();
  }

  @Get()
  @Permission('expenses:read')
  async list(
    @Query('page')               page               = '1',
    @Query('limit')              limit              = '20',
    @Query('search')             search?: string,
    @Query('status')             status?: string,
    @Query('categoryId')         categoryId?: string,
    @Query('officeId')           officeId?: string,
    @Query('dateFrom')           dateFrom?: string,
    @Query('dateTo')             dateTo?: string,
    @Query('isRecurring')        isRecurring?: string,
    @Query('isEmployeeExpense')  isEmployeeExpense?: string,
  ) {
    return this.svc.listExpenses({
      page:  parseInt(page,  10),
      limit: parseInt(limit, 10),
      search, status, categoryId, officeId, dateFrom, dateTo,
      isRecurring:       isRecurring       !== undefined ? isRecurring       === 'true' : undefined,
      isEmployeeExpense: isEmployeeExpense !== undefined ? isEmployeeExpense === 'true' : undefined,
    });
  }

  @Post()
  @Permission('expenses:create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createExpenseSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createExpense(body, user.sub);
  }

  @Get(':id')
  @Permission('expenses:read')
  async findById(@Param('id') id: string) {
    return this.svc.getExpenseById(id);
  }

  @Put(':id')
  @Permission('expenses:update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExpenseSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateExpense(id, body, user.sub);
  }

  @Delete(':id')
  @Permission('expenses:delete')
  async remove(@Param('id') id: string) {
    await this.svc.deleteExpense(id);
    return { message: 'Dépense supprimée' };
  }

  @Post(':id/submit')
  @Permission('expenses:update')
  async submit(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.submitExpense(id, user.sub);
  }

  @Post(':id/approve')
  @Permission('expenses:approve')
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.approveExpense(id, user.sub);
  }

  @Post(':id/reject')
  @Permission('expenses:approve')
  async reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectExpenseSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.rejectExpense(id, user.sub, body.reason);
  }

  @Post(':id/pay')
  @Permission('expenses:pay') // droit dédié : le paiement est une action de trésorerie sensible
  async pay(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(payExpenseSchema)) body: PayExpenseInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.payExpense(id, user.sub, body);
  }

  @Post(':id/reimburse')
  @Permission('expenses:pay') // remboursement = décaissement vers l'employé
  async reimburse(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reimburseExpenseSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.reimburseExpense(id, user.sub, body.reference ?? null);
  }

  @Post(':id/cancel')
  @Permission('expenses:update')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.cancelExpense(id, user.sub);
  }

  @Post(':id/attachment')
  @Permission('expenses:update')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadAttachment(id, file);
  }

  @Delete(':id/attachment')
  @Permission('expenses:update')
  @HttpCode(HttpStatus.OK)
  async deleteAttachment(@Param('id') id: string) {
    return this.svc.deleteAttachment(id);
  }

  // Téléchargement authentifié d'un justificatif (jamais servi en statique :
  // document financier sensible). Vérifie que le fichier appartient bien à la
  // dépense, et confine le chemin à uploads/expenses (pas de traversée).
  @Get(':id/attachments/:filename')
  @Permission('expenses:read')
  async getAttachment(
    @Param('id') id: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.svc.streamAttachment(id, filename, res);
  }
}
