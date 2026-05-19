import { z } from 'zod';

export const listBackupsSchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
});

export type ListBackupsQuery = z.infer<typeof listBackupsSchema>;
