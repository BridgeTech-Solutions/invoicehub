import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { ExpenseBudgetsController } from './expense-budgets.controller';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [ExpenseCategoriesController, ExpensesController, ExpenseBudgetsController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
