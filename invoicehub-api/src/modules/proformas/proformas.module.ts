import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { CoreServicesModule } from '../../common/services/core-services.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ProformasService } from './proformas.service';
import { ProformasController } from './proformas.controller';

@Module({
  imports: [
    PrismaModule,
    CoreServicesModule,
    ApprovalsModule,
    BullModule.registerQueue({ name: 'notification' }, { name: 'email' }),
  ],
  providers: [ProformasService],
  controllers: [ProformasController],
  exports: [ProformasService],
})
export class ProformasModule {}
