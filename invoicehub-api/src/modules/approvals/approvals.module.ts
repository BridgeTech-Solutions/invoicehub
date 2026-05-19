import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PrismaModule } from '../../prisma/prisma.module'
import { ApprovalsService } from './approvals.service'
import { ApprovalsController } from './approvals.controller'

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'notification' }, { name: 'email' }),
  ],
  providers: [ApprovalsService],
  controllers: [ApprovalsController],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
