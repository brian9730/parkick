import { AlertCircle, ArrowRight, Inbox, Info, LoaderCircle, MapPin, ShieldCheck } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function ParkickLogo({ compact = false }: { compact?: boolean }) {
  return <Link className={`brand ${compact ? 'brand-compact' : ''}`} to="/" aria-label="파킥 홈페이지"><img src="/assets/parkick_logo_text_noback.png" alt="Parkick" /></Link>;
}

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet'; children: ReactNode }) {
  return <button type="button" className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}

export function ActionLink({ to, children, variant = 'primary', className = '', arrow = false }: { to: string; children: ReactNode; variant?: 'primary' | 'secondary' | 'quiet'; className?: string; arrow?: boolean }) {
  return <Link to={to} className={`button button-${variant} ${className}`}>{children}{arrow && <ArrowRight size={19} aria-hidden="true" />}</Link>;
}

export function FormField({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return <div className="form-field"><label htmlFor={htmlFor}>{label}</label>{children}{hint && <p className="field-hint" id={`${htmlFor}-hint`}>{hint}</p>}</div>;
}

export function PhaseNotice({ children, compact = false }: { children?: ReactNode; compact?: boolean }) {
  return <div className={`phase-notice ${compact ? 'compact' : ''}`}><Info size={17} aria-hidden="true" /><div><strong>예시 화면</strong><span>{children}</span></div></div>;
}

export function EmptyState({ title, description, icon = <Inbox size={28} />, children }: { title: string; description: string; icon?: ReactNode; children?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{children}</div>;
}

export function LoadingState({ label = '화면을 불러오고 있습니다' }: { label?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={25} /><p>{label}</p></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-state" role="alert"><AlertCircle size={22} /><div><strong>잠시 연결이 원활하지 않아요</strong><p>{message}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>다시 시도</Button>}</div></div>;
}

const statusLabels = { RECEIVED: '접수', PROCESSING: '처리중', COMPLETED: '처리완료', REJECTED: '반려', DUPLICATE: '중복' };
export function StatusBadge({ status }: { status: keyof typeof statusLabels }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}><span />{statusLabels[status]}</span>;
}

export function MapPlaceholder({ large = false }: { large?: boolean }) {
  return <div className={`map-placeholder ${large ? 'map-large' : ''}`}>
    <div className="map-block map-block-one" /><div className="map-block map-block-two" /><div className="map-block map-block-three" />
    <div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" />
    <div className="map-placeholder-message"><span className="map-pin"><MapPin size={26} /></span><strong>지도가 표시될 공간이에요</strong><p>지도 서비스 연결 후 위치를 확인할 수 있어요.</p><span className="small-tag">지도 미연결</span></div>
  </div>;
}

export function PrivacyHint() {
  return <p className="privacy-hint"><ShieldCheck size={16} aria-hidden="true" />제출 전 작성 내용은 화면을 나가면 초기화됩니다.</p>;
}
