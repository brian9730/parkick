import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight, Info, MessageCircle, RotateCcw, Send, X } from 'lucide-react';
import { chatbotFaq, findFaqAnswer, recommendedFaqIds, type ChatTopic } from './chatbotFaq';
import './ChatbotWidget.css';
import { askChat, recentChat, type ChatTurn } from '../../api/chat';
import { ApiError } from '../../api/client';

type Message = { id: number; role: 'user' | 'assistant'; content: string };
type OpenChatDetail = { topic?: ChatTopic };

const welcome: Message = {
  id: 0,
  role: 'assistant',
  content: '안녕하세요! 파킥 도우미예요. 아래 자주 묻는 질문을 선택하거나 궁금한 내용을 입력해 주세요.',
};

export function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ question: string; history: ChatTurn[]; message: string; retryable: boolean } | null>(null);
  const context = useRef<ChatTurn[]>([]);
  const activeRequest = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const recommendationsRef = useRef<HTMLDetailsElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetChat = () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    context.current = [];
    setMessages([welcome]);
    setInput('');
    setFailure(null);
    setPending(false);
    inputRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!isOpen || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      const root = rootRef.current;
      if (!root) return;
      root.style.setProperty('--chat-viewport-height', `${viewport.height}px`);
      root.style.setProperty('--chat-keyboard-offset', `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
      root.dataset.compact = String(viewport.height < 520);
      if (viewport.height < 520 && recommendationsRef.current) recommendationsRef.current.open = false;
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [isOpen]);

  const closeChat = () => {
    setIsOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (isOpen) closeRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  const requestAnswer = async (question: string, history: ChatTurn[] = [...context.current]) => {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    setFailure(null);
    try {
      const result = await askChat(question, controller.signal, history);
      if (activeRequest.current !== controller) return;
      const id = nextId.current++;
      context.current = recentChat([...context.current, { role: 'user', content: question }, { role: 'assistant', content: result.answer }]);
      setMessages(current => [...current, { id, role: 'assistant', content: `${result.mode === 'mock' ? '[Mock] ' : ''}${result.answer}` }]);
    } catch (error) {
      if (activeRequest.current !== controller || controller.signal.aborted) return;
      const retryable = !(error instanceof ApiError) || ![400, 403, 413, 415, 422].includes(error.status);
      setFailure({ question, history, retryable, message: error instanceof ApiError ? error.message : '답변을 받지 못했습니다. 다시 시도해 주세요.' });
      if (!retryable) setInput(question);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setPending(false);
      }
    }
  };

  const appendExchange = (question: string, answer: string) => {
    context.current = recentChat([...context.current, { role: 'user', content: question }, { role: 'assistant', content: answer }]);
    const startId = nextId.current;
    nextId.current += 2;
    setMessages((current) => [
      ...current,
      { id: startId, role: 'user', content: question },
      { id: startId + 1, role: 'assistant', content: answer },
    ]);
  };

  const selectFaq = (topic: ChatTopic) => {
    const faq = chatbotFaq.find((item) => item.id === topic);
    if (!faq) return;
    setIsOpen(true);
    appendExchange(faq.question, faq.answer);
  };

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const topic = (event as CustomEvent<OpenChatDetail>).detail?.topic;
      setIsOpen(true);
      if (!topic) return;
      const faq = chatbotFaq.find((item) => item.id === topic);
      if (!faq) return;
      const firstId = nextId.current;
      context.current = recentChat([...context.current, { role: 'user', content: faq.question }, { role: 'assistant', content: faq.answer }]);
      nextId.current += 2;
      setMessages((current) => [
        ...current,
        { id: firstId, role: 'user', content: faq.question },
        { id: firstId + 1, role: 'assistant', content: faq.answer },
      ]);
    };
    window.addEventListener('parkick:open-chatbot', handleOpen);
    return () => window.removeEventListener('parkick:open-chatbot', handleOpen);
  }, []);

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' });
  }, [messages, isOpen, pending, failure]);

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || activeRequest.current) return;
    // 실패한 질문을 입력창에서 다시 보내도 기존 사용자 말풍선을 재사용한다.
    if (failure?.question === question) {
      void requestAnswer(question, failure.history);
      setInput('');
      return;
    }
    const answer = findFaqAnswer(question);
    setFailure(null);
    if (answer) appendExchange(question, answer);
    else {
      const id = nextId.current++;
      setMessages(current => [...current, { id, role: 'user', content: question }]);
      void requestAnswer(question);
    }
    setInput('');
  };

  return (
    <div ref={rootRef} className={`pk-chatbot-root${isOpen ? ' is-open' : ''}`}>
      {isOpen && (
        <section id="parkick-chatbot" className="pk-chatbot-panel" aria-label="파킥 안내 챗봇" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeChat(); } }}>
          <div className="pk-chatbot-header">
            <span className="pk-chatbot-avatar"><img src="/assets/parkick_logo_noback.png" alt="파킥" /></span>
            <div><strong>파킥 도우미</strong><small>신고 방법부터 서비스 이용까지</small></div>
            <button type="button" className="pk-chatbot-reset" aria-label="대화 초기화" title="대화 초기화" onClick={resetChat}><RotateCcw size={18} aria-hidden="true" /></button>
            <button ref={closeRef} type="button" className="pk-chatbot-close" aria-label="챗봇 닫기" onClick={closeChat}><X size={20} aria-hidden="true" /></button>
          </div>
          <div className="pk-chatbot-body" role="log" aria-live="polite" aria-relevant="additions text">
            {messages.map((message) => (
              <div key={message.id} className={`pk-chatbot-msg ${message.role === 'user' ? 'pk-chatbot-msg-user' : 'pk-chatbot-msg-bot'}`}>
                {message.content}
              </div>
            ))}
            {pending && <p className="pk-chatbot-msg pk-chatbot-msg-bot" role="status">답변을 준비하고 있어요…</p>}
            {failure && <div className="pk-chatbot-error" role="alert"><Info size={18} aria-hidden="true" /><div><strong>안내를 확인해 주세요</strong><p>{failure.message}</p>{failure.retryable ? <button type="button" disabled={pending} onClick={() => void requestAnswer(failure.question, failure.history)}><RotateCcw size={14} aria-hidden="true" />다시 시도</button> : <p>입력창의 질문을 수정해서 보내 주세요.</p>}</div></div>}
            <div ref={endRef} />
          </div>
          <details ref={recommendationsRef} className="pk-chatbot-recommendations" open>
            <summary className="pk-chatbot-recommendations-title">자주 묻는 질문<span>접기·펼치기<ChevronDown size={16} aria-hidden="true" /></span></summary>
            <div className="pk-chatbot-chips">
              {recommendedFaqIds.map((id) => {
                const faq = chatbotFaq.find((item) => item.id === id);
                if (!faq) return null;
                return <button className="pk-chatbot-chip" type="button" key={id} onClick={() => selectFaq(id)}>{faq.question}<ChevronRight size={14} aria-hidden="true" /></button>;
              })}
            </div>
          </details>
          <form className="pk-chatbot-form" onSubmit={sendMessage}>
            <input ref={inputRef} aria-label="질문 입력" aria-describedby="parkick-chatbot-note" value={input} maxLength={300} disabled={pending} onChange={(e) => setInput(e.target.value)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} placeholder="궁금한 내용을 입력해 주세요" />
            <button type="submit" disabled={pending || !input.trim()} aria-label="메시지 보내기"><Send size={18} aria-hidden="true" /></button>
          </form>
          <p id="parkick-chatbot-note" className="pk-chatbot-note">
            파킥 이용을 돕는 챗봇입니다.<br />
            개인정보는 입력하지 마세요. 최근 대화가 AI에 전달될 수 있어요.
          </p>        </section>
      )}
      <button ref={launcherRef} type="button" className="pk-chatbot-fab" onClick={() => isOpen ? closeChat() : setIsOpen(true)} aria-label={isOpen ? '챗봇 닫기' : '챗봇 열기'} aria-expanded={isOpen} aria-controls={isOpen ? 'parkick-chatbot' : undefined}>
        {isOpen ? <X size={24} aria-hidden="true" /> : <MessageCircle size={25} aria-hidden="true" />}
      </button>
    </div>
  );
}
