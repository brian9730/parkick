import { ApiError, apiRequest } from './client';

export interface ChatResult { mode: 'faq' | 'mock' | 'gateway'; answer: string }
export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export function recentChat(turns: ChatTurn[]): ChatTurn[] {
  const recent = turns.slice(-6);
  while (recent.reduce((total, turn) => total + turn.content.length, 0) > 3600) recent.splice(0, 2);
  return recent;
}

export async function askChat(question: string, signal: AbortSignal, history: ChatTurn[] = []): Promise<ChatResult> {
  const result = await apiRequest<ChatResult>('/chat', {
    method: 'POST', body: JSON.stringify({ question, history }), signal, timeoutMs: 35000,
  });
  if (!result || !['faq', 'mock', 'gateway'].includes(result.mode) || typeof result.answer !== 'string'
    || !result.answer.trim() || result.answer.length > 1500 || result.answer.includes('\0')) {
    throw new ApiError('안내 응답을 확인하지 못했습니다. 다시 시도해 주세요.', 502, 'CHAT_INVALID_RESPONSE');
  }
  return result;
}
