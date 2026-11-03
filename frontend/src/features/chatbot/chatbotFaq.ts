import faq from '../../../../shared/chatbot-faq.json';

export const chatbotFaq = faq;

export type ChatTopic = 'how' | 'privacy' | 'process' | 'status' | 'qr' | 'about' | 'photo-analysis';

export const recommendedFaqIds: readonly ChatTopic[] = ['how', 'process', 'status', 'privacy', 'qr'];

export function openParkickChat(topic?: ChatTopic) {
  window.dispatchEvent(new CustomEvent('parkick:open-chatbot', { detail: { topic } }));
}

export function findFaqAnswer(input: string): string | null {
  const t = input.replace(/\s+/g, '').toLowerCase();
  const exact = chatbotFaq.find(faq => faq.question.replace(/\s+/g, '').toLowerCase() === t);
  if (exact) return exact.answer;
  if (/사진.*(확인되지|미확인|다시첨부|재분석)|기기.*확인되지/.test(t)) return chatbotFaq.find(faq => faq.id === 'photo-analysis')!.answer;
  if (/개인정보|얼굴|번호판|사진.*주의|촬영.*주의/.test(t)) return chatbotFaq[1].answer;
  if (/처리결과|조회|진행상태|접수확인/.test(t)) return chatbotFaq[3].answer;
  if (/실제처리|처리절차|처리과정|신고후|어떻게처리/.test(t)) return chatbotFaq[2].answer;
  if (/qr|큐알|기기번호|업체명/.test(t)) return chatbotFaq[4].answer;
  if (/신고방법|신고하는법|어떻게신고|신고절차|신고하기/.test(t)) return chatbotFaq[0].answer;
  if (/parkick|파킥|서비스소개|무슨서비스/.test(t)) return chatbotFaq[5].answer;
  return null;
}
