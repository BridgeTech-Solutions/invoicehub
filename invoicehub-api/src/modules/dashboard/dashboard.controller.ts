import { Controller, Get } from '@nestjs/common';
import { Permission } from '../../common/decorators/permission.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@Permission('dashboard:read')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  getKpis() {
    return this.dashboardService.getKpis();
  }

  @Get('aging')
  getAging() {
    return this.dashboardService.getAging();
  }

  @Get('cashflow')
  getCashflow() {
    return this.dashboardService.getCashflowForecast();
  }
}
