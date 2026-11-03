import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApiError } from '../middleware/errors.js';
import type { ChatService } from '../services/chatbot/ChatService.js';

const text = (max: number) => z.string().max(max).trim().min(1).refine(value =>
  [...value].every(character => character.charCodeAt(0) >= 32 || ['\n', '\r', '\t'].includes(character)));
const inputSchema = z.strictObject({
  question: text(300),
  history: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), content: text(1500) }))
    .max(6).default([]).refine(turns => turns.length % 2 === 0
      && turns.every((turn, index) => turn.role === (index % 2 === 0 ? 'user' : 'assistant') && (turn.role !== 'user' || turn.content.length <= 300))
      && turns.reduce((total, turn) => total + turn.content.length, 0) <= 3600),
});

export function chatRoutes(service: ChatService): Router {
  const router = Router();
  router.post('/', rateLimit({
    windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (_request, _response, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', '질문이 많습니다. 잠시 후 다시 시도해 주세요.')),
  }), rateLimit({
    windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: () => 'all-chat-requests',
    handler: (_request, _response, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', 'AI 안내 요청이 많습니다. 잠시 후 다시 시도해 주세요.')),
  }), async (request, response) => {
    const { question, history } = inputSchema.parse(request.body);
    const controller = new AbortController();
    const abort = () => { if (!response.writableEnded) controller.abort(); };
    request.once('aborted', abort);
    response.once('close', abort);
    if (request.aborted || response.destroyed) controller.abort();
    try {
      const result = await service.answer(question, controller.signal, history);
      if (!response.destroyed) response.json({ data: result });
    } finally {
      request.removeListener('aborted', abort);
      response.removeListener('close', abort);
    }
  });
  return router;
}
