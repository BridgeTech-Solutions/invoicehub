import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus, Res, StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ExpensesService } from './expenses.service';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createBudgetSchema, updateBudgetSchema } from './expenses.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@Controller('expense-budgets')
export class ExpenseBudgetsController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  @Permission('expenses:read')
  async list(
    @Query('year')          year?: string,
    @Query('categoryId')    categoryId?: string,
    @Query('officeId')      officeId?: string,
    @Query('accountNumber') accountNumber?: string,
  ) {
    return this.svc.listBudgets({
      year:          year ? parseInt(year, 10) : undefined,
      categoryId:    categoryId ?? undefined,
      officeId:      officeId ?? undefined,
      accountNumber: accountNumber ?? undefined,
    });
  }

  @Get('summary')
  @Permission('expenses:read')
  async summary(
    @Query('year')          year?: string,
    @Query('categoryId')    categoryId?: string,
    @Query('officeId')      officeId?: string,
    @Query('accountNumber') accountNumber?: string,
  ) {
    return this.svc.getBudgetSummary({
      year:          year ? parseInt(year, 10) : undefined,
      categoryId:    categoryId ?? undefined,
      officeId:      officeId ?? undefined,
      accountNumber: accountNumber ?? undefined,
    });
  }

  @Get('export')
  @Permission('expenses:read')
  @SkipResponseWrapper()
  async export(
    @Query('format') format: string,
    @Query('year')   year: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const y = year ? parseInt(year, 10) : new Date().getUTCFullYear();
    if (format === 'xlsx') {
      const { buffer, filename } = await this.svc.exportBudgetsXlsx(y);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return new StreamableFile(buffer);
    }
    const { buffer, filename } = await this.svc.exportBudgetsPdf(y);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Post()
  @Permission('expenses:create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createBudgetSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createBudget(body, user.sub);
  }

  @Put(':id')
  @Permission('expenses:update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBudgetSchema)) body: any,
  ) {
    return this.svc.updateBudget(id, body);
  }

  @Delete(':id')
  @Permission('expenses:delete')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.svc.deleteBudget(id);
    return { message: 'Budget supprimé' };
  }
}
