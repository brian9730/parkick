import { z } from 'zod';
import type { ChatbotConfig } from '../../config.js';
import { ApiError } from '../../middleware/errors.js';
import { CHAT_SYSTEM_PROMPT } from './knowledge.js';
import { unavailable, type ChatProvider, type ChatTurn } from './ChatProvider.js';

export type ChatFetch = typeof fetch;
const resultSchema = z.object({ choices: z.array(z.object({
  finish_reason: z.literal('stop'),
  message: z.object({ role: z.literal('assistant'), content: z.string().trim().min(1).max(1500).refine(text => !text.includes('\0')), tool_calls: z.never().optional(), function_call: z.never().optional() }),
})).min(1) });

export class GatewayChatProvider implements ChatProvider {
  readonly mode = 'gateway';
  constructor(private readonly config: Extract<ChatbotConfig, { mode: 'gateway' }>, private readonly send: ChatFetch = fetch) {}

  async answer(question: string, signal: AbortSignal, history: readonly ChatTurn[] = []): Promise<string> {
    try {
      const response = await this.send(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, messages: [
          { role: 'system', content: CHAT_SYSTEM_PROMPT }, ...history, { role: 'user', content: question },
        ] }),
      });
      // Never read or forward provider error bodies, which may contain credentials or user data.
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) throw new ApiError(429, 'CHAT_BUSY', 'AI 안내 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
        throw unavailable();
      }
      // Bound received bytes before parsing. Content-Length alone is not trustworthy.
      const reader = response.body?.getReader();
      if (!reader) throw unavailable();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 32768) throw unavailable();
          chunks.push(part.value);
        }
      } finally { await reader.cancel(); }
      const data = resultSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (!data.success) throw new ApiError(502, 'CHAT_INVALID_RESPONSE', '완성된 안내를 받지 못했습니다. 다시 시도해 주세요.');
      return data.data.choices[0]!.message.content;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw unavailable();
    }
  }
}
