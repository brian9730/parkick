import type { ChatbotConfig } from '../../config.js';
import { ApiError } from '../../middleware/errors.js';
import { MockChatProvider, unavailable, type ChatProvider, type ChatTurn } from './ChatProvider.js';
import { GatewayChatProvider, type ChatFetch } from './GatewayChatProvider.js';
import { claimsPerformedAction, requestsPersonalAction } from './chatSafety.js';

export interface ChatOptions { chatFetch?: ChatFetch | undefined }

export class ChatService {
  private readonly provider: ChatProvider | null;
  constructor(private readonly config: ChatbotConfig = { mode: 'disabled', timeoutMs: 20000 }, options: ChatOptions = {}) {
    this.provider = config.mode === 'gateway' ? new GatewayChatProvider(config, options.chatFetch)
      : config.mode === 'mock' ? new MockChatProvider() : null;
  }

  async answer(question: string, signal: AbortSignal, history: readonly ChatTurn[] = []) {
    // This catches common formats only; free text cannot be made reliably free of private data.
    if ([question, ...history.map(turn => turn.content)].some(text => /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\d[\d\s()+.-]{7,}\d|sk-[a-z0-9_-]+/i.test(text))) {
      throw new ApiError(400, 'CHAT_PRIVATE_INPUT', '전화번호·이메일·키 등 개인정보나 인증정보를 빼고 질문해 주세요.');
    }
    // Recognized personal report requests are answered locally without a model call.
    if (requestsPersonalAction(question)) {
      return { mode: 'faq' as const, answer: '챗봇은 개인 신고 상태를 조회하거나 신고를 접수·전달·처리할 수 없습니다. Parkick은 개발용 서비스로 실제 지자체에 신고를 전달하지 않습니다. 신고 시 전화번호를 남겼다면 처리결과 조회 메뉴(/report/status)를 이용해 주세요.' };
    }
    if (!this.provider) throw unavailable();
    // A locally answered personal request must not reappear in a later model request as history.
    const modelHistory: ChatTurn[] = [];
    for (let index = 0; index + 1 < history.length; index += 2) {
      const user = history[index]!;
      const assistant = history[index + 1]!;
      if (user.role === 'user' && assistant.role === 'assistant' && !requestsPersonalAction(user.content)) {
        modelHistory.push(user, assistant);
      }
    }
    const controller = new AbortController();
    const abort = () => controller.abort(new ApiError(499, 'CHAT_ABORTED', '질문 전송을 취소했습니다.'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(() => controller.abort(new ApiError(504, 'CHAT_TIMEOUT', 'AI 안내 시간이 초과되었습니다. 다시 시도해 주세요.')), this.config.timeoutMs);
    let onAbort = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
    });
    try {
      const answer = await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw controller.signal.reason;
          return this.provider!.answer(question, controller.signal, modelHistory);
        }), aborted,
      ]);
      // A second boundary rejects common fabricated completion/status claims in model output.
      if (claimsPerformedAction(answer)) {
        return { mode: 'faq' as const, answer: '챗봇은 개인 신고를 조회하거나 접수·전달·처리할 수 없습니다. 실제 지자체에 신고를 전달하지 않습니다. 개인 신고 상태는 처리결과 조회 메뉴(/report/status)에서 확인해 주세요.' };
      }
      return { mode: this.provider.mode, answer };
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', onAbort);
    }
  }
}
