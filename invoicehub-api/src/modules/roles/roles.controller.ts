import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { createRoleSchema, updateRoleSchema } from './roles.schema';
import type { CreateRoleInput, UpdateRoleInput } from './roles.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@ApiTags('Rôles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly svc: RolesService) {}

  @Get('permissions')
  @Permission('roles:read')
  listPermissions() {
    return this.svc.listPermissions();
  }

  @Get()
  @Permission('roles:read')
  list() {
    return this.svc.list();
  }

  @Get(':id')
  @Permission('roles:read')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Permission('roles:manage')
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(body, user.sub);
  }

  @Patch(':id')
  @Permission('roles:manage')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @Permission('roles:manage')
  remove(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}
