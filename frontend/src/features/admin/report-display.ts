import type { AdminCompletionMethod, AdminReportSummary } from '../../api/admin';

const formatter = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' });
export const formatAdminDate = (value: string): string => formatter.format(new Date(value));
export const adminCompletionLabel = (method: AdminCompletionMethod | null): string => method === 'COLLECTED' ? '수거 완료' : method === 'TOWED' ? '견인 완료' : '';

const demoName = '개발용 (시연 데이터)';
const provinceNames = new Map([
  ['서울특별시', '서울'], ['부산광역시', '부산'], ['대구광역시', '대구'],
  ['인천광역시', '인천'], ['광주광역시', '광주'], ['대전광역시', '대전'],
  ['울산광역시', '울산'], ['경기도', '경기도'], ['경기', '경기도'],
  ['강원특별자치도', '강원'], ['강원도', '강원'],
  ['충청북도', '충북'], ['충청남도', '충남'],
  ['전북특별자치도', '전북'], ['전라북도', '전북'], ['전라남도', '전남'],
  ['경상북도', '경북'], ['경상남도', '경남'],
  ['제주특별자치도', '제주'], ['제주도', '제주'],
]);

/** A display hint from the submitted address; it never changes report ownership or access. */
function addressArea(address: string | null): string | null {
  const [province, municipality] = address?.trim().split(/\s+/) ?? [];
  if (province === '세종특별자치시') return '세종';
  const provinceName = provinceNames.get(province ?? '');
  const city = municipality?.match(/^([가-힣]{2,})(?:시|군|구)$/u)?.[1];
  return provinceName && city ? `${provinceName} ${city}` : null;
}

export function adminReportJurisdiction(report: Pick<AdminReportSummary, 'tenant' | 'region' | 'address'>): { tenantName: string | null; regionName: string } {
  return {
    tenantName: report.tenant.name === demoName ? null : report.tenant.name,
    regionName: report.region.name === demoName ? (addressArea(report.address) ?? '신고 지역 미확인') : report.region.name,
  };
}
