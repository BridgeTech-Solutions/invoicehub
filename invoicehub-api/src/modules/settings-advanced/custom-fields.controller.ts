import { Controller, Get, Post, Delete, Param, Body, Query, HttpCode } from '@nestjs/common';
import { Permission } from '../../common/decorators/permission.decorator';
import { SettingsAdvancedService } from './settings-advanced.service';
import { createCustomFieldSchema, setCustomFieldValueSchema } from './settings-advanced.schema';

@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly service: SettingsAdvancedService) {}

  @Get()
  @Permission('settings:read')
  list(@Query('entityType') entityType?: string) {
    return this.service.listCustomFields(entityType);
  }

  @Post()
  @HttpCode(201)
  @Permission('settings:manage')
  create(@Body() body: unknown) {
    return this.service.createCustomField(createCustomFieldSchema.parse(body));
  }

  @Delete(':id')
  @HttpCode(200)
  @Permission('settings:manage')
  async remove(@Param('id') id: string) {
    await this.service.deleteCustomField(id);
    return { message: 'Champ supprimé' };
  }

  @Get('values/:entityType/:entityId')
  @Permission('settings:read')
  getValues(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.service.getCustomFieldValues(entityType, entityId);
  }

  @Post('values/:entityType/:entityId')
  @Permission('settings:manage')
  setValue(
    @Param('entityType') entityType: string,
    @Param('entityId')   entityId: string,
    @Body() body: unknown,
  ) {
    const { fieldId, ...value } = setCustomFieldValueSchema.parse(body);
    return this.service.setCustomFieldValue(entityType, entityId, fieldId, value);
  }
}
