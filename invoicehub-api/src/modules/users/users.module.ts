import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'email' }),
    BullModule.registerQueue({ name: 'notification' }),
  ],
  controllers: [UsersController],
  providers:   [UsersService],
  exports:     [UsersService],
})
export class UsersModule {}
