import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { SupplierInvoicesController } from './supplier-invoices.controller';

@Module({
  imports: [PrismaModule, ApprovalsModule, BullModule.registerQueue({ name: 'notification' })],
  controllers: [SupplierInvoicesController],
  providers: [SupplierInvoicesService],
  exports: [SupplierInvoicesService],
})
export class SupplierInvoicesModule {}
