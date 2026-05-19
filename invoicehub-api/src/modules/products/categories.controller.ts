import {
  Controller, Get, Post, Put, Delete,
  Param, Body, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  createCategorySchema,
  updateCategorySchema,
} from './products.schema';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from './products.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@ApiTags('Catégories produits')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  listCategories() {
    return this.svc.listCategories();
  }

  @Get(':id')
  findCategoryById(@Param('id') id: string) {
    return this.svc.findCategoryById(id);
  }

  @Post()
  @Permission('products:create')
  @HttpCode(201)
  createCategory(
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createCategory(body, user.sub);
  }

  @Put(':id')
  @Permission('products:update')
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ) {
    return this.svc.updateCategory(id, body);
  }

  @Delete(':id')
  @Permission('products:delete')
  async deleteCategory(@Param('id') id: string) {
    await this.svc.deleteCategory(id);
    return { success: true, message: 'Catégorie supprimée' };
  }
}
