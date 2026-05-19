import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RecurringService } from './recurring.service';
import { RecurringController } from './recurring.controller';

@Module({
  imports: [PrismaModule],
  providers: [RecurringService],
  controllers: [RecurringController],
  exports: [RecurringService],
})
export class RecurringModule {}
