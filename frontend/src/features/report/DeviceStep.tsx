import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CircleHelp, ScanLine } from 'lucide-react';
import { parseQr } from '../../api/qr';
import { QRScanner } from '../qr/QRScanner';
import { FormField } from '../../components/ui';
import type { ReportDraft } from './model';
import { findOperator, operators } from './operators';
import './DeviceStep.css';

interface Props { draft: ReportDraft; onChange: (draft: ReportDraft) => void; onBusyChange: (busy: boolean) => void; showManualOnError?: boolean }

export function DeviceStep({ draft, onChange, onBusyChange, showManualOnError = false }: Props) {
  const [manual, setManual] = useState(!!draft.operatorMode);
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState('');
  const [manualRevision, setManualRevision] = useState(0);
  const requestId = useRef(0);
  const currentDraft = useRef(draft);
  const busyCallback = useRef(onBusyChange);
  useEffect(() => { currentDraft.current = draft; }, [draft]);
  useEffect(() => { busyCallback.current = onBusyChange; }, [onBusyChange]);
  useEffect(() => () => { requestId.current += 1; busyCallback.current(false); }, []);
  const manualVisible = manual || showManualOnError;

  const update = (patch: Partial<ReportDraft>) => {
    // Cancel both local image/camera decoding and pending API lookups.
    setManualRevision(revision => revision + 1);
    requestId.current += 1;
    setParsing(false); onBusyChange(false);
    setMessage('');
    const next = { ...currentDraft.current, ...patch };
    currentDraft.current = next;
    onChange(next);
  };

  const selectedOperator = draft.operatorMode === 'other' ? 'other'
      : findOperator(draft.operator)?.id ?? (draft.operatorMode === 'manual' ? 'other' : '');
  const selectOperator = (value: string) => {
    const previous = currentDraft.current;
    const operator = operators.find(item => item.id === value);
    const contextualNumber = findOperator(previous.operator)?.id === 'beam' && /^[0-9]{5}$/.test(previous.qrRawData) && previous.deviceId === previous.qrRawData;
    update({ operator: operator?.name ?? '', operatorMode: operator ? 'manual' : value === 'other' ? 'other' : '',
      ...(contextualNumber ? { deviceId: '' } : {}) });
    if (operator && previous.qrRawData && !currentDraft.current.deviceId.trim()) void fillSelectedDevice(operator.id, previous.qrRawData);
  };
  const fillSelectedDevice = async (operatorId: string, rawQr: string) => {
    const id = ++requestId.current;
    setParsing(true); onBusyChange(true); setMessage('선택한 업체의 QR 기기번호를 확인하고 있어요.');
    try {
      const parsed = await parseQr(rawQr, operatorId);
      if (id !== requestId.current) return;
      if (parsed.source === 'operator-selection' && parsed.operatorId === operatorId && parsed.deviceId) {
        const resolved = { ...currentDraft.current, deviceId: parsed.deviceId };
        currentDraft.current = resolved; onChange(resolved);
        setMessage('선택한 업체를 기준으로 QR의 기기번호를 입력했어요.');
      } else setMessage('선택한 업체는 유지됩니다. 기기에 표시된 번호를 직접 입력해 주세요.');
    } catch {
      if (id === requestId.current) setMessage('기기번호를 확인하지 못했습니다. 선택한 업체는 유지됩니다. 기기번호를 직접 입력해 주세요.');
    } finally {
      if (id === requestId.current) { setParsing(false); onBusyChange(false); }
    }
  };
  const confirmOtherOperator = () => {
    const operator = findOperator(currentDraft.current.operator);
    if (operator) update({ operator: operator.name, operatorMode: 'manual' });
  };

  const decoded = async (rawQr: string) => {
    const id = ++requestId.current;
    const selectedOperator = currentDraft.current.operatorMode === 'manual' ? findOperator(currentDraft.current.operator) : undefined;
    const next = { ...currentDraft.current, qrRawData: rawQr, operator: selectedOperator?.name ?? '', operatorMode: selectedOperator ? 'manual' as const : '' as const, deviceId: '' };
    currentDraft.current = next;
    onChange(next);
    setParsing(true); onBusyChange(true); setMessage('QR 정보의 업체 규격을 확인하고 있어요.');
    try {
      const parsed = await parseQr(rawQr, selectedOperator?.id);
      if (id !== requestId.current) return;
      const operator = operators.find(item => item.id === parsed.operatorId);
      const detected = parsed.matched && !!operator;
      const resolved = { ...currentDraft.current, operator: detected ? operator.name : selectedOperator?.name ?? '', operatorMode: detected && parsed.source !== 'operator-selection' ? 'detected' as const : selectedOperator ? 'manual' as const : '' as const, deviceId: parsed.deviceId ?? '' };
      currentDraft.current = resolved; onChange(resolved);
      setMessage(parsed.source === 'operator-selection'
        ? '선택한 업체를 기준으로 QR의 기기번호를 입력했어요.'
        : detected
        ? parsed.deviceId
          ? 'QR 정보를 읽어 업체와 기기번호를 입력했어요.'
          : 'QR에서 업체를 확인했습니다. 기기에 표시된 번호를 직접 입력해 주세요.'
        : /^[0-9]{5}$/.test(rawQr)
          ? 'QR에는 숫자만 있어 업체를 알 수 없어요. 기기가 빔이면 아래에서 빔을 선택하면 기기번호를 입력해 드려요.'
          : '업체를 자동으로 확인할 수 없습니다. 목록에서 기기에 표시된 업체를 선택하고 기기번호를 입력해 주세요.');
    } catch {
      if (id !== requestId.current) return;
      setMessage('QR 정보 확인 서버에 연결하지 못했습니다. 읽은 QR은 유지됩니다. 목록에서 업체를 선택하고 기기번호를 입력해 주세요.');
    } finally {
      if (id === requestId.current) { setParsing(false); onBusyChange(false); setManual(true); }
    }
  };

  return <div className="wizard-content device-step">
    {/* A new manual revision starts a fresh scanner session, including its local async work. */}
    <QRScanner key={manualRevision} onDecoded={rawQr => void decoded(rawQr)} disabled={parsing} compact={manualVisible} />
    {message && <p className="inline-notice" role="status">{message}</p>}
    {draft.qrRawData && <details className="qr-result"><summary><ScanLine size={16} />읽은 QR 원문 확인</summary><p>QR 주소를 자동으로 열거나 이동하지 않습니다.</p><pre>{draft.qrRawData}</pre></details>}
    <button className="manual-toggle" type="button" aria-expanded={manualVisible} onClick={() => setManual(!manualVisible)}><CircleHelp size={18} />QR을 확인하기 어려우신가요?<ChevronDown size={17} className={manualVisible ? 'rotate' : ''} /></button>
    {manualVisible && <div className="manual-fields">
      <p className="muted">QR을 읽기 어려우면 업체를 선택하고 기기에 표시된 번호를 입력해 주세요.</p>
      <FormField label="운영업체" htmlFor="operator"><select id="operator" value={selectedOperator} onChange={event => selectOperator(event.target.value)}>
        <option value="">선택하기</option>
        {operators.map(operator => <option key={operator.id} value={operator.id}>{operator.name}</option>)}
        <option value="other">기타 업체</option>
      </select></FormField>
      {draft.operatorMode === 'detected' && <p className="field-hint">QR에서 확인한 업체예요. 변경할 수 있어요.</p>}
      {selectedOperator === 'other' && <FormField label="기타 업체명" htmlFor="other-operator" hint="목록에 없는 업체만 기기에 표시된 이름을 입력해 주세요."><input id="other-operator" value={draft.operator} placeholder="기기에 표시된 업체명" maxLength={80} onChange={event => update({ operator: event.target.value, operatorMode: 'other' })} onBlur={confirmOtherOperator} aria-describedby="other-operator-hint" /></FormField>}
      <FormField label="기기번호" htmlFor="device-id" hint="필수 입력 항목입니다. QR로 인식하지 못했다면 기기에 표시된 번호를 직접 입력해 주세요."><input id="device-id" value={draft.deviceId} placeholder="기기에 표시된 번호" maxLength={100} required onChange={event => update({ deviceId: event.target.value })} aria-describedby="device-id-hint" /></FormField>
    </div>}
  </div>;
}
