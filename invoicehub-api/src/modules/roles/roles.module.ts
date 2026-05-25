import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { GatewayModule } from '../../gateway/gateway.module';

@Module({
  imports:     [GatewayModule],
  controllers: [RolesController],
  providers:   [RolesService],
  exports:     [RolesService],
})
export class RolesModule {}
