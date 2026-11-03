import { ScanLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { parseQr } from '../../api/qr';
import { QRScanner } from '../qr/QRScanner';
import { findOperator } from '../report/operators';

interface ReportIdentity { operatorName: string | null; deviceId: string | null }

export function CollectionQrCompare({ report }: { report: ReportIdentity }) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ kind: 'match' | 'mismatch' | 'unknown' | 'error'; message: string } | null>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  const toggle = () => {
    request.current += 1;
    setChecking(false);
    setResult(null);
    setOpen(value => !value);
  };
  const decoded = async (rawQr: string) => {
    const current = ++request.current;
    setResult(null);
    setChecking(true);
    try {
      // Verify the decoded QR independently of the operator recorded on the report.
      const parsed = await parseQr(rawQr);
      if (current !== request.current) return;
      const recordedOperatorId = findOperator(report.operatorName || '')?.id;
      if (!parsed.matched || !parsed.operatorId || !parsed.deviceId || !recordedOperatorId || !report.deviceId) {
        setResult({ kind: 'unknown', message: 'QR만으로 업체와 기기번호를 모두 비교할 수 없습니다. 기기에 표시된 번호를 직접 확인해 주세요.' });
      } else if (parsed.operatorId === recordedOperatorId && parsed.deviceId.trim().toUpperCase() === report.deviceId.trim().toUpperCase()) {
        setResult({ kind: 'match', message: `QR 정보가 신고 내용과 일치합니다: ${parsed.operatorName || report.operatorName} · ${parsed.deviceId}` });
      } else {
        setResult({ kind: 'mismatch', message: `QR 정보가 신고 내용과 다릅니다. 신고: ${report.operatorName} · ${report.deviceId} / QR: ${parsed.operatorName || '업체 미확인'} · ${parsed.deviceId}. 수거 전 기기를 다시 확인해 주세요.` });
      }
    } catch {
      if (current === request.current) setResult({ kind: 'error', message: 'QR 정보를 확인하지 못했습니다. 기기에 표시된 업체와 번호를 직접 비교해 주세요.' });
    } finally {
      if (current === request.current) setChecking(false);
    }
  };

  return <section className="dashboard-panel admin-detail-qr" aria-label="현장 기기 QR 재확인">
    <button type="button" className="collection-qr-toggle" aria-expanded={open} onClick={toggle}><ScanLine size={18} aria-hidden="true" />기기 QR 재확인 <span>선택</span></button>
    {open && <div className="collection-qr-content"><p>신고된 업체·기기번호와 현장 QR을 비교합니다. 스캔 결과만으로 신고 상태가 바뀌지는 않습니다.</p><QRScanner onDecoded={rawQr => void decoded(rawQr)} disabled={checking} compact idleHint="QR을 읽지 못하면 기기에 표시된 업체와 번호를 직접 비교해 주세요." manualFallback="기기에 표시된 업체와 번호를 직접 비교해 주세요." />{checking && <p role="status">QR 정보를 비교하고 있습니다…</p>}{result && <p className={`collection-qr-result ${result.kind}`} role={result.kind === 'mismatch' || result.kind === 'error' ? 'alert' : 'status'}>{result.message}</p>}</div>}
  </section>;
}
