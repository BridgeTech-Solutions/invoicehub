import { z } from 'zod';

export const chatMessageSchema = z.object({
  role:    z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
  context:  z.string().max(100).optional(),
  userName: z.string().max(80).optional(),
  userRole: z.enum(['admin', 'commercial', 'employee']).optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
