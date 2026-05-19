import {
  Controller, Get, Post, Put, Delete,
  Body, Param, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { Permission } from '../../common/decorators/permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createExpenseCategorySchema, updateExpenseCategorySchema } from './expenses.schema';

@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  @Permission('expenses:read')
  async list() {
    return this.svc.listCategories();
  }

  @Post()
  @Permission('expenses:write')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body(new ZodValidationPipe(createExpenseCategorySchema)) body: any) {
    return this.svc.createCategory(body);
  }

  @Put(':id')
  @Permission('expenses:write')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExpenseCategorySchema)) body: any,
  ) {
    return this.svc.updateCategory(id, body);
  }

  @Delete(':id')
  @Permission('expenses:delete')
  async remove(@Param('id') id: string) {
    await this.svc.deleteCategory(id);
    return { message: 'Catégorie supprimée' };
  }
}
