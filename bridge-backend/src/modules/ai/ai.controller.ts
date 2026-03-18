import { Request, Response, NextFunction } from 'express';
import { chatRequestSchema } from './ai.schema';
import { chat, chatStream, getStatus } from './ai.service';

export class AiController {
  /**
   * GET /api/ai/status
   * Vérifie si BTS Assistant (Ollama) est disponible.
   */
  async status(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = await getStatus();
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/ai/chat
   * Envoie un message et reçoit la réponse.
   *
   * Si le header Accept: text/event-stream est présent → streaming SSE.
   * Sinon → réponse JSON complète.
   */
  async chatHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { messages, context } = chatRequestSchema.parse(req.body);
      const useStream = req.headers.accept === 'text/event-stream';

      if (useStream) {
        // ── Mode streaming SSE ─────────────────────────────────────────
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        try {
          for await (const token of chatStream(messages, context)) {
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
          res.write('data: [DONE]\n\n');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erreur interne';
          res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        } finally {
          res.end();
        }
      } else {
        // ── Mode JSON complet ──────────────────────────────────────────
        const reply = await chat(messages, context);
        res.json({ success: true, data: { reply } });
      }
    } catch (err) {
      next(err);
    }
  }
}

export const aiController = new AiController();
