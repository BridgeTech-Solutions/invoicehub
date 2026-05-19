import {
  Controller, Get, Post, Put,
  Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { Permission } from '../../common/decorators/permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createBudgetSchema, updateBudgetSchema } from './expenses.schema';

@Controller('expense-budgets')
export class ExpenseBudgetsController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  @Permission('expenses:read')
  async list(
    @Query('year')       year?: string,
    @Query('categoryId') categoryId?: string,
    @Query('officeId')   officeId?: string,
  ) {
    return this.svc.listBudgets({
      year:       year       ? parseInt(year, 10) : undefined,
      categoryId: categoryId ?? undefined,
      officeId:   officeId   ?? undefined,
    });
  }

  @Post()
  @Permission('expenses:write')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body(new ZodValidationPipe(createBudgetSchema)) body: any) {
    return this.svc.createBudget(body);
  }

  @Put(':id')
  @Permission('expenses:write')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBudgetSchema)) body: any,
  ) {
    return this.svc.updateBudget(id, body);
  }
}
