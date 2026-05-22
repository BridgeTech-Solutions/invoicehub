import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
  UseGuards, Res, StreamableFile,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from '../payments/payments.service';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import { Audit } from '../../common/decorators/audit.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  listInvoicesSchema,
  computeInvoiceSchema,
  createAvoirSchema,
} from './invoices.schema';
import { createPaymentSchema } from '../payments/payments.schema';

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly svc: InvoicesService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  @Permission('invoices:read')
  @SkipResponseWrapper()
  async list(@Query() query: unknown) {
    const result = await this.svc.list(listInvoicesSchema.parse(query));
    return { success: true, ...result };
  }

  // ⚠️ Routes statiques AVANT /:id
  @Post('compute')
  @Permission('invoices:read')
  compute(@Body() body: unknown) {
    return this.svc.compute(computeInvoiceSchema.parse(body));
  }

  @Get('counts')
  @Permission('invoices:read')
  counts() { return this.svc.counts(); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permission('invoices:create')
  @Audit('invoice', 'CREATE')
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.create(createInvoiceSchema.parse(body), user.sub);
  }

  @Get(':id')
  @Permission('invoices:read')
  findById(@Param('id') id: string) { return this.svc.findById(id); }

  @Get(':id/solde-prefill')
  @Permission('invoices:read')
  soldePrefill(@Param('id') id: string) { return this.svc.soldePrefill(id); }

  @Get(':id/history')
  @Permission('invoices:read')
  history(@Param('id') id: string) { return this.svc.getHistory(id); }

  @Get(':id/payment-prediction')
  @Permission('invoices:read')
  getPaymentPrediction(@Param('id') id: string) {
    return this.svc.getPaymentPrediction(id);
  }

  @Put(':id')
  @Permission('invoices:update')
  @Audit('invoice', 'UPDATE')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.update(id, updateInvoiceSchema.parse(body), user.sub);
  }

  @Post(':id/issue')
  @Permission('invoices:update')
  @Audit('invoice', 'STATUS_CHANGE')
  issue(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.issue(id, user.sub);
  }

  @Post(':id/cancel')
  @Permission('invoices:cancel')
  @Audit('invoice', 'STATUS_CHANGE')
  cancel(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const { reason } = (body as { reason?: string }) ?? {};
    return this.svc.cancel(id, user.sub, reason);
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @Permission('invoices:create')
  @Audit('invoice', 'CREATE')
  duplicate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.duplicate(id, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission('invoices:delete')
  @Audit('invoice', 'SOFT_DELETE')
  async remove(@Param('id') id: string) {
    await this.svc.softDelete(id);
    return { message: 'Facture supprimée' };
  }

  @Post(':id/avoir')
  @HttpCode(HttpStatus.CREATED)
  @Permission('invoices:cancel')
  @Audit('invoice', 'CREATE')
  createAvoir(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.createAvoir(id, createAvoirSchema.parse(body), user.sub);
  }

  @Get(':id/pdf')
  @Permission('invoices:read')
  @UseGuards(ThrottlerGuard)
  @SkipResponseWrapper()
  @Audit('invoice', 'PDF_GENERATED')
  async getPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, filename } = await this.svc.generatePdfResponse(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(buffer);
  }

  // Paiement comme sous-route de la facture
  @Post(':id/payment')
  @HttpCode(HttpStatus.CREATED)
  @Permission('payments:create')
  @Audit('payment', 'PAYMENT_REGISTERED')
  createPayment(
    @Param('id') invoiceId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.create(invoiceId, createPaymentSchema.parse(body), user.sub);
  }

  // Quick-confirm depuis notification in-app
  @Post(':id/quick-confirm-payment')
  @HttpCode(HttpStatus.CREATED)
  @Permission('payments:create')
  @Audit('payment', 'PAYMENT_REGISTERED')
  quickConfirmPayment(
    @Param('id') invoiceId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.create(invoiceId, createPaymentSchema.parse(body), user.sub);
  }

  @Post(':id/quick-confirm-issued')
  @Permission('invoices:update')
  @Audit('invoice', 'STATUS_CHANGE')
  quickConfirmIssued(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.issue(id, user.sub);
  }
}
