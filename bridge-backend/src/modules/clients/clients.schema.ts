import { z } from 'zod';

export const createClientSchema = z.object({
  type: z.enum(['company', 'individual']).default('company'),
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  phone2: z.string().max(50).optional(),
  address: z.string().optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).default('Cameroun'),
  postalBox: z.string().max(50).optional(),
  taxNumber: z.string().max(100).optional(),
  rccm: z.string().max(100).optional(),
  bankName: z.string().max(255).optional(),
  bankAccount: z.string().max(100).optional(),
  currency: z.string().length(3).default('XAF'),
  defaultPaymentTerms: z.string().optional(),
  internalNotes: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const listClientsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z.enum(['company', 'individual']).optional(),
  status: z.enum(['active', 'archived']).optional(),
  search: z.string().optional(),
  city: z.string().optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ListClientsInput = z.infer<typeof listClientsSchema>;
