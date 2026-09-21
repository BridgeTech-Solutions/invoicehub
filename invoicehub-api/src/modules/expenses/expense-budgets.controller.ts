import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createBudgetSchema, updateBudgetSchema } from './expenses.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@Controller('expense-budgets')
export class ExpenseBudgetsController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  @Permission('expenses:read')
  async list(
    @Query('year')       year?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.svc.listBudgets({
      year:       year       ? parseInt(year, 10) : undefined,
      categoryId: categoryId ?? undefined,
    });
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
