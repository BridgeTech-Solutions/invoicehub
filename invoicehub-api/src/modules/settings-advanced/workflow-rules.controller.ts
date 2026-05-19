import { Controller, Get, Post, Delete, Param, Body, Query, Req, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { Permission } from '../../common/decorators/permission.decorator';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createWorkflowRuleSchema } from './settings-advanced.schema';

@Controller('workflow-rules')
export class WorkflowRulesController {
  constructor(private readonly service: SettingsAdvancedService) {}

  @Get()
  @Permission('settings:read')
  list(@Query('entityType') entityType?: string) {
    return this.service.listWorkflowRules(entityType);
  }

  @Post()
  @HttpCode(201)
  @Permission('settings:manage')
  create(@Body() body: unknown, @Req() req: Request) {
    return this.service.createWorkflowRule(createWorkflowRuleSchema.parse(body), req.user!.sub);
  }

  @Post(':id/toggle')
  @Permission('settings:manage')
  toggle(@Param('id') id: string) {
    return this.service.toggleWorkflowRule(id);
  }

  @Delete(':id')
  @HttpCode(200)
  @Permission('settings:manage')
  async remove(@Param('id') id: string) {
    await this.service.deleteWorkflowRule(id);
    return { message: 'Règle supprimée' };
  }
}
