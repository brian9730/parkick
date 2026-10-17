import type { PublicCompletionMethod } from '../../api/report-lookup';

const formatter = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' });
export const formatLookupDate = (value: string): string => formatter.format(new Date(value));
export const completionLabel = (method: PublicCompletionMethod): string => method === 'COLLECTED' ? '수거 완료' : method === 'TOWED' ? '견인 완료' : '';
