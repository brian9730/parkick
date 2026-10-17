export const reportSteps = ['QR 확인', '현장 사진', '위치 확인', '신고 유형', '신고 내용', '연락처 (선택)'];
export const reportCategories = ['보행로 통행 방해', '횡단보도 주변', '점자블록 위', '건물 출입구', '버스정류장 주변', '차도', '자전거도로', '킥보드가 넘어져 있음', '여러 대의 PM이 통행을 방해함', '기타'];

export interface ReportDraft {
  operator: string;
  operatorMode: '' | 'manual' | 'other' | 'unknown' | 'detected';
  deviceId: string;
  deviceUnknown: boolean;
  deviceConfirmed: boolean;
  qrRawData: string;
  categories: string[];
  additionalDescription: string;
  finalReportText: string;
  /** Optional contact: the local form uses an empty string when no number is provided. */
  phone: string;
  /** Required only when a number is provided; clearing the number also clears consent. */
  consent: boolean;
}

export const emptyDraft: ReportDraft = { operator: '', operatorMode: '', deviceId: '', deviceUnknown: false, deviceConfirmed: false, qrRawData: '', categories: [], additionalDescription: '', finalReportText: '', phone: '', consent: false };

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
