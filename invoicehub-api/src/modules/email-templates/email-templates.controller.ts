import { Controller, Get, Put, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmailTemplatesService } from './email-templates.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { updateEmailTemplateSchema, previewEmailTemplateSchema } from './email-templates.schema';
import type { UpdateEmailTemplateInput, PreviewEmailTemplateInput } from './email-templates.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@ApiTags('Templates email')
@ApiBearerAuth()
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly svc: EmailTemplatesService) {}

  @Get()
  @Permission('settings:read')
  list(@Query('locale') locale?: string) {
    return locale ? this.svc.listByLocale(locale) : this.svc.list();
  }

  // Route /by-type/:type AVANT /:id pour éviter le conflit
  @Get('by-type/:type')
  @Permission('settings:read')
  findByType(@Param('type') type: string) {
    return this.svc.findByType(type);
  }

  @Get(':id')
  @Permission('settings:read')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Get(':id/versions')
  @Permission('settings:read')
  getVersions(@Param('id') id: string) {
    return this.svc.getVersions(id);
  }

  @Put(':id')
  @Permission('settings:update')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateEmailTemplateSchema)) body: UpdateEmailTemplateInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, body, user.sub);
  }

  @Post(':id/preview')
  @Permission('settings:read')
  preview(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(previewEmailTemplateSchema)) body: PreviewEmailTemplateInput,
  ) {
    return this.svc.preview(id, body);
  }

  @Post(':id/versions/:versionId/restore')
  @Permission('settings:update')
  restoreVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.restoreVersion(id, versionId, user.sub);
  }
}
