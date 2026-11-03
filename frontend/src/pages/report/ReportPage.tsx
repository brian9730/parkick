import { ArrowLeft, ArrowRight, Check, LoaderCircle, Send } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { validateReportPhotos } from '../../api/reports';
import { Button, FormField, PrivacyHint } from '../../components/ui';
import { DeviceStep } from '../../features/report/DeviceStep';
import { emptyDraft, formatPhone, reportCategories, reportSteps } from '../../features/report/model';
import type { ReportDraft } from '../../features/report/model';
import { ReportStepIndicator } from '../../features/report/ReportStepIndicator';
import { PhotoCapture } from '../../features/photos/PhotoCapture';
import { usePhotoEvidence } from '../../features/photos/usePhotoEvidence';
import { LocationStep } from '../../features/map/LocationStep';
import { isValidCoordinates } from '../../features/map/location';
import type { ReportLocation } from '../../features/map/location';
import { useReportSubmission } from '../../features/report/useReportSubmission';
import { SubmissionProgress } from '../../features/report/SubmissionProgress';
import { saveReportReceipt } from '../../features/report/receipt';
import { normalizeOperatorName } from '../../features/report/operators';
import '../../features/report/category-step.css';
import './ReportPage.css';

const headings = ['업체와 기기번호를 확인해 주세요', '현장 사진을 등록해 주세요', '신고 위치를 확인해 주세요', '어떤 불편이 있나요?', '연락처 입력 (선택)'];
const descriptions = ['업체 선택과 기기번호는 필수예요. QR을 읽으면 자동 입력되고, 인식되지 않으면 직접 선택하고 입력할 수 있어요.', '현장 사진을 1~2장 등록해 주세요.', '지도에서 실제 신고 위치를 확인해 주세요.', '현재 상황에 해당하는 유형을 모두 선택해 주세요.', '전화번호 없이도 신고할 수 있어요. 번호를 남기면 나중에 해당 번호로 처리결과를 조회할 수 있어요.'];

function validateStep(step: number, draft: ReportDraft, photoCount: number, location: ReportLocation | null, locationConfirmed: boolean): string {
  if (step === 0) {
    if (!draft.operatorMode || !draft.operator.trim()) return '운영업체를 선택하거나 기타 업체명을 입력해 주세요.';
    if (!draft.deviceId.trim()) return '기기번호를 입력해 주세요. QR 인식이 안 되면 기기에 표시된 번호를 직접 입력할 수 있어요.';
  }
  if (step === 1 && photoCount === 0) return '현장 사진을 최소 1장 등록해 주세요.';
  if (step === 2 && (!location || !isValidCoordinates(location.latitude, location.longitude))) return '현재 위치를 가져오거나 올바른 위도와 경도를 입력해 주세요.';
  if (step === 2 && !locationConfirmed) return '신고할 위치를 확인한 뒤 확인란을 선택해 주세요.';
  if (step === 3 && !draft.categories.length) return '신고 유형을 하나 이상 선택해 주세요.';
  if (step === 4 && draft.phone && !/^010-\d{4}-\d{4}$/.test(draft.phone)) return '휴대전화 번호는 010으로 시작하는 11자리로 입력하거나, 번호 없이 제출해 주세요.';
  if (step === 4 && draft.phone && !draft.consent) return '번호를 남기려면 전화번호 수집 및 이용에 동의해 주세요. 번호 없이도 제출할 수 있어요.';
  return '';
}

export function ReportPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ReportDraft>(emptyDraft);
  const [location, setLocation] = useState<ReportLocation | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [photoValidating, setPhotoValidating] = useState(false);
  const [photoCameraActive, setPhotoCameraActive] = useState(false);
  const [photoValidation, setPhotoValidation] = useState<{ signature: string; valid: boolean; error: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const photoErrorRef = useRef<HTMLParagraphElement>(null);
  const photoValidationRequest = useRef<{ controller: AbortController; signature: string } | null>(null);
  // Remains mounted between steps; releases previews when this route unmounts.
  const evidence = usePhotoEvidence();
  const photoSignature = evidence.photos.map(photo => photo.id).join(':');
  const currentPhotoSignature = useRef(photoSignature);
  useLayoutEffect(() => {
    currentPhotoSignature.current = photoSignature;
    if (photoValidationRequest.current?.signature !== photoSignature) photoValidationRequest.current?.controller.abort();
  }, [photoSignature]);
  useEffect(() => () => photoValidationRequest.current?.controller.abort(), []);
  const photoValidationError = photoValidation?.signature === photoSignature ? photoValidation.error : '';
  const validatedPhotoSignature = photoValidation?.valid ? photoValidation.signature : null;
  const submission = useReportSubmission(step >= 1);
  const validationError = validateStep(step, draft, evidence.photos.length, location, locationConfirmed);
  const finalValidationError = reportSteps.map((_, index) => validateStep(index, draft, evidence.photos.length, location, locationConfirmed)).find(Boolean) || '';
  const changeDraft = (nextDraft: ReportDraft) => setDraft(nextDraft);
  const update = <K extends keyof ReportDraft>(key: K, value: ReportDraft[K]) => changeDraft({ ...draft, [key]: value });
  const updatePhone = (value: string) => {
    const phone = formatPhone(value);
    setDraft(previous => ({ ...previous, phone, consent: phone ? previous.consent : false }));
  };
  const goTo = (next: number) => {
    if (submission.submitting || photoCameraActive) return;
    submission.clearError();
    setStep(next); setValidationAttempted(false);
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 600px)').matches) window.scrollTo({ top: 0, behavior: 'auto' });
      else headingRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };
  const nextStep = async () => {
    if (photoCameraActive) return;
    if (validationError) {
      setValidationAttempted(true);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    if (step === 1) {
      if (photoValidationRequest.current) return;
      if (validatedPhotoSignature !== photoSignature) {
        const controller = new AbortController();
        photoValidationRequest.current = { controller, signature: photoSignature };
        setPhotoValidating(true);
        setPhotoValidation({ signature: photoSignature, valid: false, error: '' });
        try {
          await validateReportPhotos(evidence.photos.map(photo => photo.file), controller.signal);
          if (controller.signal.aborted || currentPhotoSignature.current !== photoSignature) return;
          setPhotoValidation({ signature: photoSignature, valid: true, error: '' });
        } catch (cause) {
          if (controller.signal.aborted || currentPhotoSignature.current !== photoSignature) return;
          setPhotoValidation({ signature: photoSignature, valid: false, error: cause instanceof ApiError && cause.code === 'PHOTO_NOT_PM'
            ? cause.message
            : '사진을 확인할 수 없어 다음 단계로 진행할 수 없어요. 잠시 후 다시 시도해 주세요.' });
          requestAnimationFrame(() => photoErrorRef.current?.focus());
          return;
        } finally {
          if (photoValidationRequest.current?.controller === controller) {
            photoValidationRequest.current = null;
            setPhotoValidating(false);
          }
        }
      }
    }
    goTo(step + 1);
  };
  const submit = async () => {
    if (finalValidationError || !location || evidence.busy || qrBusy || submission.submitting) return;
    const result = await submission.submit({
      operator: normalizeOperatorName(draft.operator),
      deviceId: draft.deviceId.trim(),
      qrRawData: draft.qrRawData || null,
      latitude: location.latitude, longitude: location.longitude, address: location.address.trim() || null,
      categories: [...draft.categories], additionalDescription: draft.categories.includes('기타') ? draft.additionalDescription.trim() : '',
      phone: draft.phone ? draft.phone.replace(/\D/g, '') : null,
      consent: !!draft.phone && draft.consent,
    }, evidence.photos);
    if (result.error?.code === 'PHOTO_NOT_PM') {
      submission.clearError();
      setPhotoValidation({ signature: photoSignature, valid: false, error: result.error.message });
      setStep(1);
      setValidationAttempted(false);
      requestAnimationFrame(() => { headingRef.current?.focus(); photoErrorRef.current?.focus(); });
      return;
    }
    if (!result.receipt) return;
    saveReportReceipt(result.receipt);
    // Leaving this route releases all local photo previews and the draft.
    navigate('/report/complete', { replace: true, state: { receipt: result.receipt } });
  };

  return <div className="flow-page"><div className="flow-container">
    <Link className="back-link" to="/"><ArrowLeft size={16} />홈으로</Link>
    <h1 className="sr-only">공유 킥보드 신고</h1>
    <ReportStepIndicator step={step} />
    <div className="wizard-card" aria-busy={submission.submitting || photoValidating}><fieldset className="wizard-fields" disabled={submission.submitting} aria-label="신고 정보 입력">
      <div className="wizard-heading"><span className="step-kicker">STEP {String(step + 1).padStart(2, '0')} <span>/ {String(reportSteps.length).padStart(2, '0')}</span></span><h2 ref={headingRef} tabIndex={-1}>{headings[step]}</h2><p>{descriptions[step]}</p></div>
      {step === 0 && <DeviceStep draft={draft} onChange={changeDraft} onBusyChange={setQrBusy} showManualOnError={validationAttempted} />}
      {step === 1 && <div className="wizard-content"><PhotoCapture evidence={evidence} validationBusy={photoValidating} validationMode={submission.status?.photoValidation} onCameraActiveChange={setPhotoCameraActive} /><PrivacyHint />
        {submission.status?.photoValidation === 'mock'
          ? <p className="field-hint">개발용 모의 검사에서는 실제 사진 내용을 AI로 판별하지 않습니다.</p>
          : submission.status?.photoValidation === 'disabled'
            ? <p className="field-hint">AI 사진 판정은 아직 적용되지 않았어요. 사진 파일 형식만 확인하고 신고를 접수합니다.</p>
            : !submission.status?.photoValidation
              ? <p className="field-hint">사진 검사 방식을 확인하고 있어요.</p>
              : null}
        {photoValidationError && <p className="wizard-validation" role="alert" ref={photoErrorRef} tabIndex={-1}>{photoValidationError}</p>}
      </div>}
      {step === 2 && <div className="wizard-content location-wizard-content">
        <LocationStep value={location} onChange={value => { setLocation(value); setLocationConfirmed(false); }} />
        <label className="checkbox-label location-confirmation"><input type="checkbox" checked={locationConfirmed} disabled={!location} onChange={event => setLocationConfirmed(event.target.checked)} /><span>실제 신고할 위치임을 확인했습니다.</span></label>
      </div>}
      {step === 3 && <div className="wizard-content category-step">
        <span className="field-hint">여러 개를 선택할 수 있어요.</span>
        <div className="category-grid">{reportCategories.map(category => <button type="button" key={category} className={`category-option ${draft.categories.includes(category) ? 'selected' : ''}`} aria-pressed={draft.categories.includes(category)} onClick={() => update('categories', draft.categories.includes(category) ? draft.categories.filter(item => item !== category) : [...draft.categories, category])}><span className="category-checkbox">{draft.categories.includes(category) && <Check size={13} />}</span>{category}</button>)}</div>
        {draft.categories.includes('기타') && <FormField label="추가 설명 (선택)" htmlFor="additional-description"><textarea id="additional-description" rows={3} maxLength={500} value={draft.additionalDescription} placeholder="필요하면 상황을 간단히 알려주세요." onChange={event => update('additionalDescription', event.target.value)} /><span className="character-count">{draft.additionalDescription.length} / 500</span></FormField>}
      </div>}
      {step === 4 && <div className="wizard-content">
        <FormField label="휴대전화 번호 (선택)" htmlFor="contact-phone" hint="번호 없이도 제출할 수 있어요. 번호를 남긴 신고는 해당 번호를 입력해 신고내역과 처리 상태를 조회할 수 있어요."><input type="tel" id="contact-phone" inputMode="tel" autoComplete="off" value={draft.phone} maxLength={13} placeholder="입력하지 않아도 돼요" onChange={event => updatePhone(event.target.value)} aria-describedby="contact-phone-hint" /></FormField>
        {draft.phone && <div className="consent-card"><label className="checkbox-label"><input type="checkbox" checked={draft.consent} required onChange={event => update('consent', event.target.checked)} /><span><strong>[번호 입력 시 필수] 전화번호 수집 및 이용 동의</strong><span>번호를 남기려면 신고내역과 처리결과 조회를 위한 수집·이용에 동의해 주세요.</span></span></label><details><summary>개인정보 안내 확인</summary><p>전화번호 입력은 선택사항입니다. 번호를 남기고 제출하면 신고와 함께 서버에 저장되며, 해당 번호를 입력해 신고내역과 진행 상태를 조회할 수 있습니다. 번호를 남기지 않아도 신고할 수 있지만 전화번호로 조회할 수는 없습니다.</p></details></div>}
        <div className="report-summary"><h3>입력한 신고 정보</h3><dl>
          <div><dt>업체</dt><dd>{normalizeOperatorName(draft.operator) || '선택 전'}</dd></div>
          <div><dt>기기번호</dt><dd>{draft.deviceId.trim() || '입력 전'}</dd></div>
          <div><dt>현장 사진</dt><dd>{evidence.photos.length}장 · 제출 시 함께 전송</dd></div>
          <div><dt>위치</dt><dd>{location?.address || (location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : '확인 전')}</dd></div>
          <div><dt>신고 유형</dt><dd>{draft.categories.join(', ') || '선택 안 함'}</dd></div>
          <div><dt>연락처 (선택)</dt><dd>{draft.phone || '입력하지 않음'}</dd></div>
          <div><dt>제출 상태</dt><dd>아직 접수되지 않았어요</dd></div>
        </dl></div><PrivacyHint />
        {finalValidationError && <p className="inline-error" role="alert">{finalValidationError}</p>}
        <div className="submission-service" aria-live="polite">
          {submission.serviceLoading ? <p className="field-hint"><LoaderCircle size={15} className="spin" aria-hidden="true" /> 접수 가능 여부를 확인하고 있어요…</p>
            : submission.serviceError || !submission.status?.available || submission.status.mode === 'disabled' ? <><p className="inline-notice">{submission.serviceError || '지금은 신고 접수를 이용할 수 없어요.'} 입력한 내용은 유지됩니다.</p><Button variant="secondary" onClick={submission.refreshStatus}>접수 상태 다시 확인</Button></>
              : <p className="field-hint">제출하면 접수번호가 발급돼요. 접수 후 번호를 확인해 주세요.</p>}
        </div>
        {submission.error && <p className="wizard-validation" role="alert">{submission.error}</p>}
      </div>}
      {validationAttempted && validationError && <div className="wizard-validation" role="alert" ref={errorRef} tabIndex={-1}>{validationError}</div>}
      <div className="wizard-actions">
        {step > 0 && <Button variant="secondary" onClick={() => goTo(step - 1)} disabled={evidence.busy || photoValidating || photoCameraActive || submission.submitting}><ArrowLeft size={17} />이전</Button>}
        {step < reportSteps.length - 1 ? <Button className="next-button" onClick={() => void nextStep()} disabled={qrBusy || evidence.busy || photoValidating || photoCameraActive}>{step === 3 ? '연락처 화면 보기' : '다음 단계'}{photoValidating ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <ArrowRight size={18} />}</Button> : <Button className="next-button" onClick={() => void submit()} disabled={!!finalValidationError || evidence.busy || qrBusy || submission.submitting || !submission.status?.available || submission.status.mode === 'disabled'}>{submission.submitting ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}{submission.submitting ? '신고 제출 중…' : '신고 제출'}</Button>}
      </div>
      <p className="wizard-bottom-note">{reportSteps[step]} · {step + 1} / {reportSteps.length} 단계</p></fieldset>
    </div><p className="flow-outro">작은 관심이 모두를 위한 길을 만들어요.</p>
  </div><SubmissionProgress active={submission.submitting} progress={submission.progress} /></div>;
}
