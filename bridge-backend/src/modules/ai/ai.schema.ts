import { z } from 'zod';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
  /** Page courante de l'utilisateur — permet à l'IA d'être contextuelle */
  context: z.string().max(100).optional(),
});

export type ChatMessage  = z.infer<typeof chatMessageSchema>;
export type ChatRequest  = z.infer<typeof chatRequestSchema>;
