import { Controller, Get, Patch, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import {
  listNotificationsSchema,
  updateNotificationSettingsSchema,
} from './notifications.schema';
import type { ListNotificationsQuery, UpdateNotificationSettingsInput } from './notifications.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // Spread du résultat → contrat { success, data[], total, page, limit, totalPages, unreadCount }
  @Get()
  @Permission('notifications:read')
  @SkipResponseWrapper()
  async list(
    @Query(new ZodValidationPipe(listNotificationsSchema)) query: ListNotificationsQuery,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.svc.list(user.sub, query.page, query.limit, query.unreadOnly);
    return { success: true, ...result };
  }

  @Patch(':id/read')
  @Permission('notifications:read')
  async markRead(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.svc.markRead(id, user.sub);
    return { success: true, message: 'Notification marquée comme lue' };
  }

  @Post('mark-all-read')
  @Permission('notifications:read')
  async markAllRead(@CurrentUser() user: JwtPayload) {
    await this.svc.markAllRead(user.sub);
    return { success: true, message: 'Toutes les notifications marquées comme lues' };
  }

  @Get('settings')
  @Permission('notifications:read')
  getSettings(@CurrentUser() user: JwtPayload) {
    return this.svc.getSettings(user.sub);
  }

  @Post('settings')
  @Permission('notifications:read')
  updateSettings(
    @Body(new ZodValidationPipe(updateNotificationSettingsSchema)) body: UpdateNotificationSettingsInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateSettings(user.sub, body.settings);
  }

  @Post('settings/disable-all')
  @Permission('notifications:read')
  async disableAll(@CurrentUser() user: JwtPayload) {
    const data = await this.svc.disableAll(user.sub);
    return { success: true, data, message: 'Toutes les notifications ont été désactivées' };
  }

  @Post('settings/enable-all')
  @Permission('notifications:read')
  async enableAll(@CurrentUser() user: JwtPayload) {
    const data = await this.svc.enableAll(user.sub);
    return { success: true, data, message: 'Toutes les notifications ont été réactivées' };
  }
}
