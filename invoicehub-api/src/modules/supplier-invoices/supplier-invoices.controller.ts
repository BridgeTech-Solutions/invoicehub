import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, Query, Res, HttpCode, HttpStatus, StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createSupplierInvoiceSchema, updateSupplierInvoiceSchema,
  paySupplierInvoiceSchema, disputeSchema,
} from './supplier-invoices.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@Controller('supplier-invoices')
export class SupplierInvoicesController {
  constructor(private readonly svc: SupplierInvoicesService) {}

  @Get()
  @Permission('supplier-invoices:read')
  async list(
    @Query('page')       page       = '1',
    @Query('limit')      limit      = '20',
    @Query('status')     status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('dateFrom')   dateFrom?: string,
    @Query('dateTo')     dateTo?: string,
    @Query('search')     search?: string,
  ) {
    return this.svc.list({
      page:  parseInt(page,  10),
      limit: parseInt(limit, 10),
      status, supplierId, dateFrom, dateTo, search,
    });
  }

  @Post()
  @Permission('supplier-invoices:write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createSupplierInvoiceSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(body, user.sub);
  }

  @Get(':id/pdf')
  @Permission('supplier-invoices:read')
  @SkipResponseWrapper()
  async getPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, filename } = await this.svc.generatePdf(id);
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get(':id/payments')
  @Permission('supplier-invoices:read')
  async listPayments(@Param('id') id: string) {
    return this.svc.listPayments(id);
  }

  @Get(':id')
  @Permission('supplier-invoices:read')
  async findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Put(':id')
  @Permission('supplier-invoices:write')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierInvoiceSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, body, user.sub);
  }

  @Delete(':id')
  @Permission('supplier-invoices:delete')
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { message: 'Facture fournisseur supprimée' };
  }

  @Post(':id/validate')
  @Permission('supplier-invoices:validate')
  async validate(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.validate(id, user.sub);
  }

  @Post(':id/dispute')
  @Permission('supplier-invoices:write')
  async dispute(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(disputeSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.dispute(id, user.sub, body.reason);
  }

  @Post(':id/pay')
  @Permission('supplier-invoices:pay')
  async pay(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(paySupplierInvoiceSchema)) body: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.pay(id, body, user.sub);
  }
}
