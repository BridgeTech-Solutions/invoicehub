import { z } from 'zod'

export const createWorkflowSchema = z.object({
  name:        z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  isActive:    z.boolean().default(true),
  priority:    z.number().int().min(0).default(0),
  triggers: z.array(z.object({
    documentType: z.enum(['invoice', 'proforma', 'purchase_order', 'supplier_invoice', 'expense']),
    field:        z.string().max(50),
    operator:     z.enum(['gte', 'lte', 'eq', 'gt', 'lt']),
    value:        z.string().max(200),
  })).min(1),
  steps: z.array(z.object({
    order:          z.number().int().min(1),
    name:           z.string().min(2).max(100),
    description:    z.string().max(300).optional(),
    approverRole:   z.string().max(50).optional(),
    approverUserId: z.string().uuid().optional(),
    deadlineHours:  z.number().int().min(1).max(720).optional(),
    requireComment: z.boolean().default(false),
    allowDelegate:  z.boolean().default(true),
  })).min(1),
}).refine(
  (data) => data.steps.every((s) => s.approverRole || s.approverUserId),
  { message: 'Chaque étape doit avoir un approbateur (rôle ou utilisateur)' },
)

const workflowBaseSchema = z.object({
  name:        z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  isActive:    z.boolean().default(true),
  priority:    z.number().int().min(0).default(0),
  triggers: z.array(z.object({
    documentType: z.enum(['invoice', 'proforma', 'purchase_order', 'supplier_invoice', 'expense']),
    field:        z.string().max(50),
    operator:     z.enum(['gte', 'lte', 'eq', 'gt', 'lt']),
    value:        z.string().max(200),
  })).min(1).optional(),
  steps: z.array(z.object({
    order:          z.number().int().min(1),
    name:           z.string().min(2).max(100),
    description:    z.string().max(300).optional(),
    approverRole:   z.string().max(50).optional(),
    approverUserId: z.string().uuid().optional(),
    deadlineHours:  z.number().int().min(1).max(720).optional(),
    requireComment: z.boolean().default(false),
    allowDelegate:  z.boolean().default(true),
  })).min(1).optional(),
})

export const updateWorkflowSchema = workflowBaseSchema

export const listWorkflowsSchema = z.object({
  isActive: z.enum(['true', 'false']).optional().transform((v) =>
    v === 'true' ? true : v === 'false' ? false : undefined,
  ),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const listRequestsSchema = z.object({
  status:        z.enum(['pending', 'approved', 'rejected', 'cancelled', 'expired']).optional(),
  documentType:  z.enum(['invoice', 'proforma', 'purchase_order', 'supplier_invoice', 'expense']).optional(),
  requestedById: z.string().uuid().optional(),
  pendingForMe:  z.enum(['true', 'false']).optional(),
  page:          z.coerce.number().int().min(1).default(1),
  limit:         z.coerce.number().int().min(1).max(100).default(20),
})

export const approveSchema = z.object({
  comment: z.string().max(1000).optional(),
})

export const rejectSchema = z.object({
  comment: z.string().min(1).max(1000),
})

export const delegateSchema = z.object({
  delegatedToId: z.string().uuid(),
  comment:       z.string().max(1000).optional(),
})

export type CreateWorkflowInput  = z.infer<typeof createWorkflowSchema>
export type UpdateWorkflowInput  = z.infer<typeof workflowBaseSchema>
export type ListWorkflowsInput   = z.infer<typeof listWorkflowsSchema>
export type ListRequestsInput    = z.infer<typeof listRequestsSchema>
export type ApproveInput         = z.infer<typeof approveSchema>
export type RejectInput          = z.infer<typeof rejectSchema>
export type DelegateInput        = z.infer<typeof delegateSchema>
