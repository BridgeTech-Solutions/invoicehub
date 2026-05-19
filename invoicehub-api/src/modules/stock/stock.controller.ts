import {
  Controller, Get, Post,
  Body, Param, Query, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  adjustStockSchema,
  listMovementsSchema,
  stockLevelsSchema,
} from './stock.schema';
import type { AdjustStockInput, ListMovementsInput, StockLevelsInput } from './stock.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@ApiTags('Stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private readonly svc: StockService) {}

  @Get('summary')
  @Permission('stock:read')
  summary() {
    return this.svc.getStockSummary();
  }

  @Get('levels')
  @Permission('stock:read')
  levels(@Query(new ZodValidationPipe(stockLevelsSchema)) query: StockLevelsInput) {
    return this.svc.getStockLevels(query);
  }

  @Get('alerts')
  @Permission('stock:read')
  alerts() {
    return this.svc.getStockAlerts();
  }

  @Get('movements')
  @Permission('stock:read')
  listMovements(@Query(new ZodValidationPipe(listMovementsSchema)) query: ListMovementsInput) {
    return this.svc.listMovements(query);
  }

  @Post('movements/adjust')
  @Permission('stock:adjust')
  @Audit('stock', 'CREATE')
  @HttpCode(201)
  adjust(
    @Body(new ZodValidationPipe(adjustStockSchema)) body: AdjustStockInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.adjustStock(body, user.sub);
  }

  @Get('movements/:id')
  @Permission('stock:read')
  getMovement(@Param('id') id: string) {
    return this.svc.getMovementById(id);
  }

  @Get('levels/:productId/history')
  @Permission('stock:read')
  productHistory(
    @Param('productId') productId: string,
    @Query('page')  page  = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.getProductStockHistory(
      productId,
      parseInt(page,  10),
      parseInt(limit, 10),
    );
  }
}
