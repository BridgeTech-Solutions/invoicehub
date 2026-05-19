import { Controller, Get, Post, Body, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { SkipResponseWrapper } from '../../common/interceptors/response.interceptor';
import { AiService } from './ai.service';
import { chatRequestSchema } from './ai.schema';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('status')
  async status() {
    return this.aiService.getStatus();
  }

  @Post('chat')
  @SkipResponseWrapper()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async chat(@Body() body: unknown, @Req() req: Request, @Res() res: Response) {
    const { messages, context, userName, userRole } = chatRequestSchema.parse(body);
    const useStream = req.headers.accept === 'text/event-stream';

    if (useStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let clientDisconnected = false;
      req.on('close', () => { clientDisconnected = true; });

      try {
        for await (const token of this.aiService.chatStream(messages, context, userName, userRole)) {
          if (clientDisconnected) break;
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
        if (!clientDisconnected) res.write('data: [DONE]\n\n');
      } catch (err: unknown) {
        if (!clientDisconnected) {
          const msg = err instanceof Error ? err.message : 'Erreur interne';
          res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        }
      } finally {
        res.end();
      }
    } else {
      const reply = await this.aiService.chat(messages, context, userName, userRole);
      res.json({ success: true, data: { reply } });
    }
  }
}
