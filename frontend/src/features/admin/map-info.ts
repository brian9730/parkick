import type { AdminMapReport, AdminReportStatus } from '../../api/admin';
import { adminCompletionLabel, formatAdminDate } from './report-display';

export const mapStatusLabels: Record<AdminReportStatus, string> = { RECEIVED: '접수', PROCESSING: '처리중', COMPLETED: '처리완료', REJECTED: '반려' };

function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string, text?: string): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Report content is untrusted: never insert it as HTML, including in SDK overlays. */
export function createReportMapInfo(reports: AdminMapReport[], close: () => void): HTMLElement {
  const root = element('section', 'admin-map-info');
  root.setAttribute('aria-label', '선택한 위치의 신고 정보');
  const heading = element('div', 'admin-map-info-heading');
  const samePosition = reports.every(report => report.latitude === reports[0].latitude && report.longitude === reports[0].longitude);
  heading.append(element('strong', '', reports.length > 1 ? `${samePosition ? '같은 위치의' : '주변'} 신고 ${reports.length}건` : '신고 정보'));
  const closeButton = element('button', 'admin-map-info-close', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '신고 정보 닫기');
  closeButton.addEventListener('click', close);
  heading.append(closeButton);
  const list = element('div', 'admin-map-info-list');
  for (const report of reports) {
    const card = element('article', 'admin-map-info-report');
    card.append(element('h3', '', report.publicId));
    const status = mapStatusLabels[report.status];
    const completion = adminCompletionLabel(report.completionMethod);
    card.append(element('span', `admin-map-status status-${report.status.toLowerCase()}`, completion ? `${status} · ${completion}` : status));
    card.append(element('p', 'admin-map-info-device', `${report.operatorName || '업체 미확인'} · ${report.deviceId || '기기번호 없음'}`));
    card.append(element('p', 'admin-map-info-address', report.address || `위도 ${report.latitude.toFixed(6)} · 경도 ${report.longitude.toFixed(6)}`));
    const time = element('time', '', `접수 ${formatAdminDate(report.createdAt)}`);
    time.dateTime = report.createdAt;
    card.append(time);
    const link = element('a', 'admin-map-info-link', '신고 상세 보기');
    link.href = `/admin/reports/${encodeURIComponent(report.publicId)}`;
    link.setAttribute('aria-label', `${report.publicId} 신고 상세 보기`);
    card.append(link);
    list.append(card);
  }
  root.append(heading, list);
  return root;
}

export function createReportMapMarker(reports: AdminMapReport[], expandable = false): HTMLButtonElement {
  const mixed = reports.some(report => report.status !== reports[0].status);
  const status = mixed ? 'mixed' : reports[0].status.toLowerCase();
  const button = element('button', `admin-map-marker admin-map-marker-${status}`, String(reports.length));
  button.type = 'button';
  const label = expandable ? `주변 신고 ${reports.length}건 확대하기` : reports.length > 1 ? `신고 위치 ${reports.length}건 보기` : `${reports[0].publicId} 신고 위치 보기`;
  button.setAttribute('aria-label', label);
  button.title = label;
  return button;
}
