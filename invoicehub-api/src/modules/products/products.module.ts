import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';

@Module({
  controllers: [ProductsController, CategoriesController],
  providers:   [ProductsService],
  exports:     [ProductsService],
})
export class ProductsModule {}
