import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsAdvancedService } from './settings-advanced.service';
import { WebhooksController } from './webhooks.controller';
import { ApiKeysController } from './api-keys.controller';
import { CustomFieldsController } from './custom-fields.controller';
import { WorkflowRulesController } from './workflow-rules.controller';
import { IpWhitelistController } from './ip-whitelist.controller';
import { ExportJobsController } from './export-jobs.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'export' }),
  ],
  providers: [SettingsAdvancedService],
  controllers: [
    WebhooksController,
    ApiKeysController,
    CustomFieldsController,
    WorkflowRulesController,
    IpWhitelistController,
    ExportJobsController,
  ],
})
export class SettingsAdvancedModule {}
