import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Res, HttpCode, HttpStatus, StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createPurchaseOrderSchema, updatePurchaseOrderSchema,
  receiveLineSchema, computeSchema,
} from './purchase-orders.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly svc: PurchaseOrdersService) {}

  @Get()
  @Permission('purchase-orders:read')
  async list(
    @Query('page')       page       = '1',
    @Query('limit')      limit      = '20',
    @Query('search')     search?: string,
    @Query('status')     status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('dateFrom')   dateFrom?: string,
    @Query('dateTo')     dateTo?: string,
  ) {
    return this.svc.list({
      page:  parseInt(page,  10),
      limit: parseInt(limit, 10),
      search, status, supplierId, dateFrom, dateTo,
    });
  }

  @Post('compute')
  @Permission('purchase-orders:read')
  async compute(@Body(new ZodValidationPipe(computeSchema)) body: any) {
    return this.svc.computeDryRun(body.lines);
  }

  @Post()
  @Permission('purchase-orders:write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createPurchaseOrderSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(body, user.sub);
  }

  @Get(':id/pdf')
  @Permission('purchase-orders:read')
  @SkipResponseWrapper()
  async getPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, filename } = await this.svc.generatePdf(id);
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @Permission('purchase-orders:read')
  async findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Put(':id')
  @Permission('purchase-orders:write')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePurchaseOrderSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, body, user.sub);
  }

  @Delete(':id')
  @Permission('purchase-orders:delete')
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { message: 'Bon de commande supprimé' };
  }

  @Post(':id/send')
  @Permission('purchase-orders:write')
  async send(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.send(id, user.sub);
  }

  @Post(':id/confirm')
  @Permission('purchase-orders:write')
  async confirm(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.confirm(id, user.sub);
  }

  @Post(':id/cancel')
  @Permission('purchase-orders:write')
  async cancel(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.cancel(id, user.sub, body.comment);
  }

  @Post(':id/receive')
  @Permission('purchase-orders:write')
  async receive(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(receiveLineSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.receive(id, body, user.sub);
  }
}
