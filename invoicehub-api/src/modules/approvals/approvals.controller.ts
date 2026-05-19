import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common'
import { ApprovalsService } from './approvals.service'
import { Permission } from '../../common/decorators/permission.decorator'
import { Permissions } from '../../common/decorators/permissions.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor'
import type { JwtPayload } from '../../common/types/jwt-payload.type'
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  listWorkflowsSchema,
  listRequestsSchema,
  approveSchema,
  rejectSchema,
  delegateSchema,
} from './approvals.schema'

@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly svc: ApprovalsService) {}

  // ── Workflows (admin) ─────────────────────────────────────────

  @Get('workflows')
  @Permission('approvals:admin')
  @SkipResponseWrapper()
  async listWorkflows(@Query() query: unknown) {
    const result = await this.svc.listWorkflows(listWorkflowsSchema.parse(query))
    return { success: true, ...result }
  }

  @Post('workflows')
  @HttpCode(HttpStatus.CREATED)
  @Permission('approvals:admin')
  createWorkflow(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.createWorkflow(createWorkflowSchema.parse(body), user.sub)
  }

  @Get('workflows/:id')
  @Permission('approvals:admin')
  findWorkflow(@Param('id') id: string) {
    return this.svc.findWorkflowById(id)
  }

  @Put('workflows/:id')
  @Permission('approvals:admin')
  updateWorkflow(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.svc.updateWorkflow(id, updateWorkflowSchema.parse(body), user.sub)
  }

  @Delete('workflows/:id')
  @HttpCode(HttpStatus.OK)
  @Permission('approvals:admin')
  async deleteWorkflow(@Param('id') id: string) {
    await this.svc.deleteWorkflow(id)
    return { message: 'Workflow désactivé' }
  }

  // ── Demandes ──────────────────────────────────────────────────

  @Get('requests')
  @Permissions('approvals:view', 'approvals:view_own')
  @SkipResponseWrapper()
  async listRequests(@Query() query: unknown, @CurrentUser() user: JwtPayload) {
    const result = await this.svc.listRequests(listRequestsSchema.parse(query), user.sub)
    return { success: true, ...result }
  }

  @Get('pending-count')
  @Permissions('approvals:view', 'approvals:view_own')
  async pendingCount(@CurrentUser() user: JwtPayload) {
    const count = await this.svc.pendingCount(user.sub)
    return { count }
  }

  @Get('requests/:id')
  @Permissions('approvals:view', 'approvals:view_own')
  findRequest(@Param('id') id: string) {
    return this.svc.findRequestById(id)
  }

  @Post('requests/:id/approve')
  @Permission('approvals:approve')
  async approve(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    await this.svc.approve(id, user.sub, approveSchema.parse(body))
    return { message: 'Demande approuvée' }
  }

  @Post('requests/:id/reject')
  @Permission('approvals:approve')
  async reject(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    await this.svc.reject(id, user.sub, rejectSchema.parse(body))
    return { message: 'Demande rejetée' }
  }

  @Post('requests/:id/delegate')
  @Permission('approvals:approve')
  async delegate(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    await this.svc.delegate(id, user.sub, delegateSchema.parse(body))
    return { message: 'Décision déléguée' }
  }

  @Post('requests/:id/cancel')
  @Permissions('approvals:view', 'approvals:view_own')
  async cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.svc.cancel(id, user.sub)
    return { message: 'Demande annulée' }
  }
}
