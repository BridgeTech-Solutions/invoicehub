import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus, Res, StreamableFile,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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

  @Post('carry-over')
  @Permission('expenses:create')
  @HttpCode(HttpStatus.OK)
  async carryOver(
    @Body() body: { fromYear: number; toYear: number; basis?: 'budget' | 'remaining' },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.carryOverBudgets(Number(body.fromYear), Number(body.toYear), body.basis === 'remaining' ? 'remaining' : 'budget', user.sub);
  }

  @Post('import')
  @Permission('expenses:create')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = /\.xlsx$/i.test(file.originalname) || file.mimetype.includes('spreadsheetml');
      cb(ok ? null : new Error('Formats acceptés : .xlsx uniquement.'), ok);
    },
  }))
  async import(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtPayload) {
    if (!file) throw new Error('Aucun fichier fourni');
    return this.svc.importBudgets(file.buffer, user.sub);
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
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateBudget(id, body, user.sub);
  }

  @Get(':id/revisions')
  @Permission('expenses:read')
  async revisions(@Param('id') id: string) {
    return this.svc.getBudgetRevisions(id);
  }

  @Post(':id/activate')
  @Permission('expenses:approve')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id') id: string) {
    return this.svc.activateBudget(id);
  }

  @Post(':id/spread')
  @Permission('expenses:update')
  @HttpCode(HttpStatus.OK)
  async spread(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.spreadBudgetToMonthly(id, user.sub);
  }

  @Delete(':id')
  @Permission('expenses:delete')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.svc.deleteBudget(id);
    return { message: 'Budget supprimé' };
  }
}
