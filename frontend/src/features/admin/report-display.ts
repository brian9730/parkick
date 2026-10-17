import type { AdminCompletionMethod } from '../../api/admin';

const formatter = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' });
export const formatAdminDate = (value: string): string => formatter.format(new Date(value));
export const adminCompletionLabel = (method: AdminCompletionMethod | null): string => method === 'COLLECTED' ? '수거 완료' : method === 'TOWED' ? '견인 완료' : '';
