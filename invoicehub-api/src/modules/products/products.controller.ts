import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import {
  createProductSchema,
  updateProductSchema,
  listProductsSchema,
  importProductsSchema,
} from './products.schema';
import type {
  CreateProductInput,
  UpdateProductInput,
  ListProductsInput,
  ImportProductsInput,
} from './products.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@ApiTags('Produits')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  @SkipResponseWrapper()
  async list(@Query(new ZodValidationPipe(listProductsSchema)) query: ListProductsInput) {
    const result = await this.svc.list(query);
    return { success: true, ...result };
  }

  @Post('import')
  @Permission('products:create')
  @Audit('product', 'CREATE')
  @HttpCode(200)
  async importProducts(
    @Body(new ZodValidationPipe(importProductsSchema)) body: ImportProductsInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.importProducts(body.rows, user.sub);
  }

  @Get(':id/line-defaults')
  lineDefaults(
    @Param('id') id: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.svc.lineDefaults(id, clientId);
  }

  @Get(':id/stock-status')
  @Permission('stock:read')
  getStockStatus(@Param('id') id: string) {
    return this.svc.getStockStatus(id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Permission('products:create')
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(body, user.sub);
  }

  @Put(':id')
  @Permission('products:update')
  @Audit('product', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @Permission('products:delete')
  @Audit('product', 'SOFT_DELETE')
  async remove(@Param('id') id: string) {
    await this.svc.softDelete(id);
    return { success: true, message: 'Produit archivé' };
  }
}
