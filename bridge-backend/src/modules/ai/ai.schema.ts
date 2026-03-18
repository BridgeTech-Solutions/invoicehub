import { z } from 'zod';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
  /** Page courante de l'utilisateur — permet à l'IA d'être contextuelle */
  context:  z.string().max(100).optional(),
  /** Prénom de l'utilisateur connecté — pour personnaliser les réponses */
  userName: z.string().max(80).optional(),
  /** Rôle de l'utilisateur connecté — pour adapter les réponses aux permissions */
  userRole: z.enum(['admin', 'commercial', 'employee']).optional(),
});

export type ChatMessage  = z.infer<typeof chatMessageSchema>;
export type ChatRequest  = z.infer<typeof chatRequestSchema>;
