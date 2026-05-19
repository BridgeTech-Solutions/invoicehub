import { z } from 'zod';
import { NotificationStatus, NotificationChannel } from '@prisma/client';

export const listNotificationsSchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z.preprocess(val => val === 'true' || val === true, z.boolean()).default(false),
});

export const updateNotificationSettingsSchema = z.object({
  settings: z.array(z.object({
    type:    z.nativeEnum(NotificationStatus),
    channel: z.nativeEnum(NotificationChannel),
    enabled: z.boolean(),
  })).min(1),
});

export type ListNotificationsQuery         = z.infer<typeof listNotificationsSchema>;
export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsSchema>;
