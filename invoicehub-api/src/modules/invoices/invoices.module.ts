import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { GatewayModule } from '../../gateway/gateway.module';
import { CoreServicesModule } from '../../common/services/core-services.module';
import { PaymentsModule } from '../payments/payments.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { StockModule } from '../stock/stock.module';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';

@Module({
  imports: [
    PrismaModule,
    GatewayModule,
    CoreServicesModule,
    PaymentsModule,
    ApprovalsModule,
    StockModule,
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'notification' },
    ),
  ],
  providers: [InvoicesService],
  controllers: [InvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
