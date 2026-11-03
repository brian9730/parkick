import { ApiError } from '../../middleware/errors.js';

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export interface ChatProvider {
  readonly mode: 'mock' | 'gateway';
  answer(question: string, signal: AbortSignal, history?: readonly ChatTurn[]): Promise<string>;
}

export function unavailable(): ApiError {
  return new ApiError(503, 'CHAT_UNAVAILABLE', 'AI 안내를 사용할 수 없습니다. 잠시 후 다시 시도하거나 추천 질문을 이용해 주세요.');
}

/** Development only: no SDK, credentials or network access. */
export class MockChatProvider implements ChatProvider {
  readonly mode = 'mock';
  async answer(_question: string, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw unavailable();
    return '테스트용 Mock 안내입니다. Parkick은 개발용 서비스이며 실제 지자체에 신고를 전달하지 않습니다. 챗봇은 개인 신고 상태를 조회할 수 없습니다. 자세한 이용 방법은 추천 질문에서 확인해 주세요.';
  }
}
