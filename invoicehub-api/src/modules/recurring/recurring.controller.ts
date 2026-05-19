import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import {
  createRecurringSchema,
  updateRecurringSchema,
  listRecurringSchema,
} from './recurring.schema';

@Controller('recurring')
export class RecurringController {
  constructor(private readonly svc: RecurringService) {}

  @Get()
  @SkipResponseWrapper()
  async list(@Query() query: unknown) {
    const result = await this.svc.list(listRecurringSchema.parse(query));
    return { success: true, ...result };
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permission('invoices:create')
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.create(createRecurringSchema.parse(body), user.sub);
  }

  @Put(':id')
  @Permission('invoices:update')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, updateRecurringSchema.parse(body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission('invoices:delete')
  async remove(@Param('id') id: string) {
    await this.svc.softDelete(id);
    return { message: 'Gabarit supprimé' };
  }

  @Post(':id/activate')
  @Permission('invoices:create')
  async activate(@Param('id') id: string) {
    await this.svc.toggleActive(id, true);
    return { message: 'Gabarit activé' };
  }

  @Post(':id/deactivate')
  @Permission('invoices:create')
  async deactivate(@Param('id') id: string) {
    await this.svc.toggleActive(id, false);
    return { message: 'Gabarit désactivé' };
  }

  @Post(':id/generate')
  @Permission('invoices:create')
  generate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.generate(id, user.sub);
  }
}
