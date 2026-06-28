import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const createSupplierSchema = z.object({
  name:           z.string().min(2).max(255),
  type:           z.enum(['individual', 'company', 'government', 'ngo', 'other']).default('company'),
  email:          z.string().email().max(255).optional().nullable(),
  phone:          z.string().max(50).optional().nullable(),
  address:        z.string().max(500).optional().nullable(),
  city:           z.string().max(100).optional().nullable(),
  country:        z.string().max(100).default('Cameroun'),
  taxNumber:         z.string().max(100).optional().nullable(),
  rccm:              z.string().max(100).optional().nullable(),
  website:           z.string().url().max(255).optional().nullable(),
  currency:          z.string().length(3).default('XAF'),
  defaultDueDays:    z.number().int().min(0).max(365).default(30),
  paymentMethod:     z.enum(['virement', 'especes', 'cheque', 'mobile_money', 'autre']).optional().nullable(),
  status:            z.enum(['active', 'inactive', 'blacklisted']).default('active'),
  category:          z.string().max(100).optional().nullable(),
  rating:            z.number().int().min(1).max(5).optional().nullable(),
  bankName:          z.string().max(200).optional().nullable(),
  bankAccount:       z.string().max(100).optional().nullable(),
  accountingAccount: z.string().max(20).optional().nullable(),
  internalNotes:     z.string().optional().nullable(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const createContactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName:  z.string().max(100).optional().nullable(),
  position:  z.string().max(200).optional().nullable(),
  email:     z.string().email().max(255).optional().nullable(),
  phone:     z.string().max(50).optional().nullable(),
  isPrimary: z.boolean().default(false),
});

export const updateContactSchema = createContactSchema.partial();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type CreateContactInput  = z.infer<typeof createContactSchema>;
export type UpdateContactInput  = z.infer<typeof updateContactSchema>;

// DTO Swagger (corps documentés) — validation via ZodValidationPipe.
export class CreateSupplierDto extends createZodDto(createSupplierSchema) {}
export class UpdateSupplierDto extends createZodDto(updateSupplierSchema) {}
export class CreateContactDto  extends createZodDto(createContactSchema) {}
export class UpdateContactDto  extends createZodDto(updateContactSchema) {}
