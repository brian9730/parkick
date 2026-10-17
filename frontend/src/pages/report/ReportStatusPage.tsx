import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, ClipboardList, LoaderCircle, Search, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, EmptyState, FormField, LoadingState, PhaseNotice, StatusBadge } from '../../components/ui';
import { useReportLookup } from '../../features/report/lookup-context';
import { completionLabel, formatLookupDate } from '../../features/report/lookup-display';
import { parseReportReceipt, readReportReceipt } from '../../features/report/receipt';
import '../../features/report/lookup.css';
import '../../features/report/submission.css';

export function ReportStatusPage() {
  const { phoneInput, result, loading, error, changePhone, loadPage } = useReportLookup();
  return <div className="flow-page status-page"><div className="status-container">
    <Link className="back-link" to="/"><ArrowLeft size={16} />홈으로</Link>
    <div className="status-heading"><span className="feature-icon"><ClipboardList size={30} strokeWidth={1.5} /></span><p className="overline">REPORT STATUS</p><h1>신고 처리현황 조회</h1><p>신고할 때 남긴 휴대전화 번호를 입력하면<br />해당 번호의 신고내역과 진행 상태를 확인해요.</p></div>
    <div className="status-form-card">
      <p className="field-hint">인증번호 없이 입력한 번호와 일치하는 신고를 조회해요. 번호를 남기지 않은 신고는 조회할 수 없어요.</p>
      <form autoComplete="off" onSubmit={event => { event.preventDefault(); void loadPage(); }}>
        <FormField label="휴대전화 번호" htmlFor="lookup-phone" hint="신고할 때 남긴 번호를 입력해 주세요."><div className="input-with-icon"><Smartphone size={19} aria-hidden="true" /><input id="lookup-phone" type="tel" inputMode="tel" autoComplete="off" maxLength={13} placeholder="010-0000-0000" value={phoneInput} onChange={event => changePhone(event.target.value)} required pattern="010-[0-9]{4}-[0-9]{4}" aria-describedby="lookup-phone-hint" /></div></FormField>
        <Button type="submit" className="full-width" disabled={loading}>{loading ? <>조회 중…<LoaderCircle size={18} className="spin lookup-submit-icon" aria-hidden="true" /></> : <>신고내역 조회<ArrowRight size={18} aria-hidden="true" /></>}</Button>
      </form>
      {error && <div role="alert" className="lookup-error">{error}</div>}
    </div>
    {loading && <LoadingState label="신고내역을 조회하고 있어요" />}
    {result && <section className="lookup-results" aria-labelledby="lookup-results-heading">
      <div className="lookup-results-heading"><h2 id="lookup-results-heading">신고내역</h2><p role="status">이번 페이지 {result.items.length}건</p></div>
      {result.items.length === 0 ? <EmptyState icon={<Search size={28} />} title="조회된 신고가 없어요" description="입력한 번호로 접수된 신고가 없습니다. 신고할 때 남긴 번호를 다시 확인해 주세요." /> : <ul className="lookup-list">{result.items.map(report => <li key={report.publicId}>
        <Link to={`/report/status/${encodeURIComponent(report.publicId)}`} className="lookup-report-card">
          <div className="lookup-card-top"><div className="lookup-statuses"><StatusBadge status={report.status} />{report.completionMethod && <span className="lookup-completion">{completionLabel(report.completionMethod)}</span>}</div><ChevronRight size={18} aria-hidden="true" /></div>
          <p className="lookup-id">{report.publicId}</p>
          <dl className="lookup-metadata"><div><dt>접수 일시</dt><dd><time dateTime={report.createdAt}>{formatLookupDate(report.createdAt)}</time></dd></div><div><dt>운영업체</dt><dd>{report.operatorName || '확인되지 않음'}</dd></div>{report.completedAt && <div><dt>완료 일시</dt><dd><time dateTime={report.completedAt}>{formatLookupDate(report.completedAt)}</time></dd></div>}</dl>
          <ul className="lookup-tags" aria-label="신고 유형">{report.categories.map(category => <li key={category}>{category}</li>)}</ul>
        </Link>
      </li>)}</ul>}
      {(result.page > 1 || result.hasMore) && <nav className="lookup-pagination" aria-label="신고내역 페이지"><Button variant="secondary" disabled={result.page === 1 || loading} onClick={() => void loadPage(result.page - 1)}>이전</Button><span>{result.page} 페이지</span><Button variant="secondary" disabled={!result.hasMore || result.page >= 1000 || loading} onClick={() => void loadPage(result.page + 1)}>다음</Button></nav>}
    </section>}
  </div></div>;
}

export function ReportCompletePage() {
  const route = useLocation();
  const [receipt] = useState(() => parseReportReceipt((route.state as { receipt?: unknown } | null)?.receipt) ?? readReportReceipt());
  if (!receipt) return <div className="flow-page"><div className="status-container"><EmptyState title="접수된 신고 정보가 없어요" description="이 화면에서 확인할 접수 정보가 없습니다. 신고를 제출한 뒤 발급된 접수번호를 확인해 주세요."><Link to="/report" className="button button-primary">신고하러 가기</Link><Link to="/" className="text-link">홈으로 돌아가기</Link></EmptyState></div></div>;
  const receivedAt = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(receipt.createdAt));
  return <div className="flow-page"><div className="status-container">
    <div className="status-heading"><span className="feature-icon"><CheckCircle2 size={32} strokeWidth={1.5} /></span><p className="overline">REPORT RECEIVED</p><h1>개발용 신고가 접수됐어요</h1><p>신고 내용과 사진을 저장했습니다.<br />아래 접수번호를 확인해 주세요.</p></div>
    <div className="status-form-card receipt-card">
      <PhaseNotice>개발용 접수입니다. 지자체에 전달되거나 실제 민원으로 처리되지 않아요.</PhaseNotice>
      <div className="report-summary"><h3>접수 정보</h3><dl>
        <div><dt>접수번호</dt><dd className="receipt-id">{receipt.publicId}</dd></div>
        <div><dt>접수 상태</dt><dd><StatusBadge status={receipt.status} /></dd></div>
        <div><dt>접수 일시</dt><dd><time dateTime={receipt.createdAt}>{receivedAt} (한국 시간)</time></dd></div>
        <div><dt>신고 위치</dt><dd>{receipt.address || `${receipt.latitude.toFixed(6)}, ${receipt.longitude.toFixed(6)}`}</dd></div>
        <div><dt>연락처</dt><dd>{receipt.hasContact ? '전화번호를 남겼어요' : '전화번호 없이 접수했어요'}</dd></div>
      </dl></div>
      <p className="field-hint">{receipt.hasContact ? '남긴 전화번호를 입력하면 신고내역과 진행 상태를 조회할 수 있어요.' : '전화번호를 남기지 않은 신고는 전화번호로 조회할 수 없어요.'} 접수번호를 따로 보관해 주세요.</p>
      <div className="receipt-actions">{receipt.hasContact && <Link to="/report/status" className="button button-primary">처리결과 조회</Link>}<Link to="/report" className={`button button-${receipt.hasContact ? 'secondary' : 'primary'}`}>새 신고 작성</Link><Link to="/" className="text-link">홈으로 돌아가기</Link></div>
    </div>
  </div></div>;
}
