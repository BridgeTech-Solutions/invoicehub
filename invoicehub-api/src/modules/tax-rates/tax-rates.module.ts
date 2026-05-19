import { Module } from '@nestjs/common';
import { TaxRatesService } from './tax-rates.service';
import { TaxRatesController } from './tax-rates.controller';

@Module({
  controllers: [TaxRatesController],
  providers:   [TaxRatesService],
  exports:     [TaxRatesService],
})
export class TaxRatesModule {}
