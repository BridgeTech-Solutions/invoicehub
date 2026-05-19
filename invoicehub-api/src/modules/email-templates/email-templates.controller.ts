import { Controller, Get, Put, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmailTemplatesService } from './email-templates.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permission } from '../../common/decorators/permission.decorator';
import { updateEmailTemplateSchema, previewEmailTemplateSchema } from './email-templates.schema';
import type { UpdateEmailTemplateInput, PreviewEmailTemplateInput } from './email-templates.schema';

@ApiTags('Templates email')
@ApiBearerAuth()
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly svc: EmailTemplatesService) {}

  @Get()
  @Permission('settings:read')
  list() {
    return this.svc.list();
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

  @Put(':id')
  @Permission('settings:update')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateEmailTemplateSchema)) body: UpdateEmailTemplateInput,
  ) {
    return this.svc.update(id, body);
  }

  @Post(':id/preview')
  @Permission('settings:read')
  preview(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(previewEmailTemplateSchema)) body: PreviewEmailTemplateInput,
  ) {
    return this.svc.preview(id, body);
  }
}
