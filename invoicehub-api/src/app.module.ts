import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { validate } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { CommonAuthModule } from './common/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './modules/health/health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RbacGuard } from './common/guards/rbac.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

// Phase 2 — Modules simples
import { TaxRatesModule } from './modules/tax-rates/tax-rates.module';
import { OfficesModule } from './modules/offices/offices.module';
import { RolesModule } from './modules/roles/roles.module';
import { EmailTemplatesModule } from './modules/email-templates/email-templates.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { GuideModule } from './modules/guide/guide.module';

// Phase 3 — Auth & Users
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

// Phase 4 — Modules métier
import { CoreServicesModule } from './common/services/core-services.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ProductsModule } from './modules/products/products.module';
import { RecurringModule } from './modules/recurring/recurring.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProformasModule } from './modules/proformas/proformas.module';
import { InvoicesModule } from './modules/invoices/invoices.module';

// Phase 5 — Bank
import { BankModule } from './modules/bank/bank.module';

// Phase 6 — Suppliers, Stock, PurchaseOrders, SupplierInvoices, Expenses
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { StockModule } from './modules/stock/stock.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { SupplierInvoicesModule } from './modules/supplier-invoices/supplier-invoices.module';
import { ExpensesModule } from './modules/expenses/expenses.module';

// Phase 7 Part 1 — Dashboard, Search, Reports
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SearchModule } from './modules/search/search.module';
import { ReportsModule } from './modules/reports/reports.module';

// Phase 7 Part 2 — Audit, Backups, Settings, AI
import { AuditModule } from './modules/audit/audit.module';
import { BackupsModule } from './modules/backups/backups.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SettingsAdvancedModule } from './modules/settings-advanced/settings-advanced.module';
import { AiModule } from './modules/ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    CommonAuthModule,
    GatewayModule,
    JobsModule,
    HealthModule,
    // Phase 2
    TaxRatesModule,
    OfficesModule,
    RolesModule,
    EmailTemplatesModule,
    NotificationsModule,
    GuideModule,
    // Phase 3
    AuthModule,
    UsersModule,
    // Phase 4
    CoreServicesModule,
    ClientsModule,
    ProductsModule,
    RecurringModule,
    ApprovalsModule,
    PaymentsModule,
    ProformasModule,
    InvoicesModule,
    // Phase 5
    BankModule,
    // Phase 6
    SuppliersModule,
    StockModule,
    PurchaseOrdersModule,
    SupplierInvoicesModule,
    ExpensesModule,
    // Phase 7 Part 1
    DashboardModule,
    SearchModule,
    ReportsModule,
    // Phase 7 Part 2
    AuditModule,
    BackupsModule,
    SettingsModule,
    SettingsAdvancedModule,
    AiModule,
  ],
  providers: [
    { provide: APP_GUARD,       useClass: JwtAuthGuard },
    { provide: APP_GUARD,       useClass: RbacGuard },
    { provide: APP_FILTER,      useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
