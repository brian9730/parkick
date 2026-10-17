import { ArrowLeft, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lookupReportDetail, reportLookupError } from '../../api/report-lookup';
import type { PublicReportDetail } from '../../api/report-lookup';
import { Button, EmptyState, LoadingState, StatusBadge } from '../../components/ui';
import { useReportLookup } from '../../features/report/lookup-context';
import { completionLabel, formatLookupDate } from '../../features/report/lookup-display';
import '../../features/report/lookup.css';

interface DetailResponse { key: string; report: PublicReportDetail | null; error: string }

export function PublicReportDetailPage() {
  const { publicId = '' } = useParams();
  const { searchedPhone, changePhone } = useReportLookup();
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<DetailResponse | null>(null);
  const requestKey = `${searchedPhone}:${publicId}:${attempt}`;

  useEffect(() => {
    if (!searchedPhone || !publicId) return;
    const controller = new AbortController();
    void lookupReportDetail(publicId, searchedPhone, controller.signal).then(report => {
      if (!controller.signal.aborted) setResponse({ key: requestKey, report, error: '' });
    }).catch(failure => {
      if (!controller.signal.aborted) setResponse({ key: requestKey, report: null, error: reportLookupError(failure) });
    });
    return () => controller.abort();
  }, [searchedPhone, publicId, requestKey]);

  if (!searchedPhone) return <div className="flow-page"><div className="status-container"><EmptyState icon={<Search size={28} />} title="먼저 전화번호로 신고내역을 조회해 주세요" description="새로고침하거나 조회 화면을 나가면 번호를 다시 입력해야 해요. 신고할 때 남긴 번호로 조회해 주세요."><Link to="/report/status" className="button button-primary">처리결과 조회로 이동</Link></EmptyState></div></div>;
  const current = response?.key === requestKey ? response : null;
  const report = current?.report;
  return <div className="flow-page status-page"><div className="status-container">
    <Link className="back-link" to="/report/status"><ArrowLeft size={16} />신고내역으로</Link>
    <div className="lookup-detail-heading"><p className="overline">REPORT STATUS</p><h1>신고 처리현황</h1><p className="lookup-id">{publicId}</p></div>
    {!current && <LoadingState label="신고 처리현황을 불러오고 있어요" />}
    {current?.error && <div className="lookup-error" role="alert"><p>{current.error}</p><Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>다시 시도</Button></div>}
    {report && <>
      <section className="status-form-card lookup-detail-card" aria-labelledby="lookup-detail-summary">
        <h2 id="lookup-detail-summary">접수 정보</h2>
        <div className="lookup-statuses"><StatusBadge status={report.status} />{report.completionMethod && <span className="lookup-completion">{completionLabel(report.completionMethod)}</span>}</div>
        <dl className="lookup-metadata"><div><dt>접수번호</dt><dd className="lookup-id">{report.publicId}</dd></div><div><dt>접수 일시</dt><dd><time dateTime={report.createdAt}>{formatLookupDate(report.createdAt)}</time></dd></div><div><dt>운영업체</dt><dd>{report.operatorName || '확인되지 않음'}</dd></div>{report.completedAt && <div><dt>완료 일시</dt><dd><time dateTime={report.completedAt}>{formatLookupDate(report.completedAt)}</time></dd></div>}<div><dt>신고 유형</dt><dd><ul className="lookup-tags">{report.categories.map(category => <li key={category}>{category}</li>)}</ul></dd></div></dl>
      </section>
      <section className="lookup-history" aria-labelledby="lookup-history-heading"><h2 id="lookup-history-heading">처리 이력</h2>{report.history.length ? <ol className="lookup-timeline">{report.history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
        <div className="lookup-statuses"><StatusBadge status={entry.status} />{entry.completionMethod && <span className="lookup-completion">{completionLabel(entry.completionMethod)}</span>}</div>
        <time className="lookup-history-time" dateTime={entry.createdAt}>{formatLookupDate(entry.createdAt)}</time>
        {entry.publicNote && <p className="lookup-history-note">{entry.publicNote}</p>}
      </li>)}</ol> : <p className="field-hint">아직 등록된 처리 이력이 없어요.</p>}</section>
    </>}
    <div className="lookup-detail-actions"><Link to="/report/status" className="button button-secondary">신고내역으로 돌아가기</Link><Link to="/report/status" className="text-link" onClick={() => changePhone('')}>다른 번호로 조회</Link></div>
  </div></div>;
}
