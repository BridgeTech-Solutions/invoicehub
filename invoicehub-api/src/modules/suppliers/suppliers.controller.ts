import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createSupplierSchema, updateSupplierSchema,
  createContactSchema, updateContactSchema,
  CreateSupplierDto, UpdateSupplierDto, CreateContactDto, UpdateContactDto,
} from './suppliers.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}

  // ── Fournisseurs ─────────────────────────────────────────────────────────────

  @Get()
  @Permission('suppliers:read')
  async list(
    @Query('page')       page       = '1',
    @Query('limit')      limit      = '20',
    @Query('search')     search?: string,
    @Query('status')     status?: string,
    @Query('category')   category?: string,
  ) {
    return this.svc.listSuppliers({
      page:  parseInt(page,  10),
      limit: parseInt(limit, 10),
      search, status, category,
    });
  }

  @Post()
  @Permission('suppliers:write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createSupplierSchema)) body: CreateSupplierDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createSupplier(body, user.sub);
  }

  @Get(':id/purchase-orders')
  @Permission('suppliers:read')
  async getPurchaseOrders(
    @Param('id')    id: string,
    @Query('page')  page  = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.getSupplierPurchaseOrders(id, { page: parseInt(page, 10), limit: parseInt(limit, 10) });
  }

  @Get(':id/invoices')
  @Permission('suppliers:read')
  async getInvoices(
    @Param('id')    id: string,
    @Query('page')  page  = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.getSupplierInvoices(id, { page: parseInt(page, 10), limit: parseInt(limit, 10) });
  }

  @Get(':id/financial-summary')
  @Permission('suppliers:read')
  async getFinancialSummary(@Param('id') id: string) {
    return this.svc.getFinancialSummary(id);
  }

  @Get(':id')
  @Permission('suppliers:read')
  async getById(@Param('id') id: string) {
    return this.svc.getSupplierById(id);
  }

  @Put(':id')
  @Permission('suppliers:write')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierSchema)) body: UpdateSupplierDto,
  ) {
    return this.svc.updateSupplier(id, body);
  }

  @Delete(':id')
  @Permission('suppliers:delete')
  async remove(@Param('id') id: string) {
    await this.svc.deleteSupplier(id);
    return { message: 'Fournisseur supprimé' };
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────

  @Get(':id/contacts')
  @Permission('suppliers:read')
  async listContacts(@Param('id') id: string) {
    return this.svc.listContacts(id);
  }

  @Post(':id/contacts')
  @Permission('suppliers:write')
  @HttpCode(HttpStatus.CREATED)
  async addContact(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createContactSchema)) body: CreateContactDto,
  ) {
    return this.svc.addContact(id, body);
  }

  @Put(':id/contacts/:contactId')
  @Permission('suppliers:write')
  async updateContact(
    @Param('id')        id: string,
    @Param('contactId') contactId: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: UpdateContactDto,
  ) {
    return this.svc.updateContact(id, contactId, body);
  }

  @Delete(':id/contacts/:contactId')
  @Permission('suppliers:write')
  async deleteContact(
    @Param('id')        id: string,
    @Param('contactId') contactId: string,
  ) {
    await this.svc.deleteContact(id, contactId);
    return { message: 'Contact supprimé' };
  }
}
