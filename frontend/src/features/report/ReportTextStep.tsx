import { Info, LoaderCircle, RotateCcw, Sparkles, Square } from 'lucide-react';
import { Button, FormField } from '../../components/ui';
import type { ReportGenerationController } from './useReportGeneration';
import './ReportTextStep.css';

interface Props {
  text: string;
  confirmed: boolean;
  factsChanged: boolean;
  generation: ReportGenerationController;
  onTextChange: (text: string) => void;
  onConfirm: (confirmed: boolean) => void;
  onApply: (text: string) => void;
}

export function ReportTextStep({ text, confirmed, factsChanged, generation, onTextChange, onConfirm, onApply }: Props) {
  const { status, serviceLoading, serviceError, proposal, generating, error, notice, proposalStale } = generation;
  const isMock = status?.mode === 'mock';
  const canGenerate = !serviceLoading && !!status?.available && status.mode !== 'disabled';
  const generationLabel = isMock ? proposal ? '예시 문구 다시 생성' : '예시 문구 생성'
    : status?.mode === 'bedrock' ? proposal ? 'AI 신고문 다시 생성' : 'AI 신고문 생성'
      : status?.mode === 'disabled' ? '신고문 자동 작성 미사용' : '신고문 생성';

  return <div className="wizard-content report-text-step">
    <section className="report-generation" aria-label="신고문 자동 작성" aria-busy={generating || serviceLoading}>
      <div className="ai-preview-note"><Sparkles size={22} aria-hidden="true" /><div>
        <strong>{serviceLoading ? '자동 작성 설정을 확인하고 있어요' : isMock ? '예시 문구 작성' : status?.mode === 'bedrock' ? 'AI로 신고문 초안을 작성해요' : '신고 내용을 직접 작성할 수 있어요'}</strong>
        <p>{serviceLoading ? '확인 중에도 아래에서 직접 작성할 수 있어요.' : isMock ? '입력한 사실을 정해진 문장으로 정리해요. AI가 생성한 문구는 아니에요.' : status?.mode === 'bedrock' ? '입력한 사실을 바탕으로 문구를 제안해요. 실제 상황과 맞는지 확인해 주세요.' : '현재 자동 작성을 사용할 수 없어요. 직접 작성한 신고문으로 다음 단계에 진행할 수 있어요.'}</p>
      </div></div>
      <p className="field-hint">업체·기기번호·주소·신고 유형·추가 설명으로 작성해요. 사진과 연락처는 자동 작성에 사용하지 않아요.</p>
      {serviceError && <div className="inline-error" role="alert"><p>{serviceError}</p><Button variant="secondary" onClick={generation.refreshStatus}>자동 작성 연결 다시 확인</Button></div>}
      <div className="report-generation-actions"><Button variant="secondary" disabled={!canGenerate || generating} onClick={() => void generation.generate()}>{generating ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : proposal ? <RotateCcw size={17} aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}{generationLabel}</Button>{generating && <Button variant="quiet" onClick={() => generation.cancel()}><Square size={15} aria-hidden="true" />생성 취소</Button>}</div>
      {generating && <p className="field-hint" role="status">{isMock ? '예시 문구를 만들고 있어요…' : '신고문 초안을 생성하고 있어요…'} 직접 입력하거나 화면을 이동하면 생성을 취소해요.</p>}
      {notice && <p className="inline-notice" role="status">{notice}</p>}
      {error && <p className="inline-error" role="alert">{error} 작성 중인 신고 내용은 유지됩니다.</p>}
    </section>

    {proposal && <section className="report-proposal" aria-label="생성된 신고문 제안">
      <strong>{proposal.result.mode === 'mock' ? '예시 문구 · AI 생성 아님' : 'AI가 제안한 신고문'}</strong>
      <p className="report-proposal-text">{proposal.result.generatedText}</p>
      {proposalStale ? <p className="inline-notice">기본 정보가 바뀌어 이전 제안을 사용할 수 없어요. 현재 정보로 다시 생성해 주세요.</p> : <p className="field-hint">내용을 확인하고 적용해 주세요. 적용하면 아래 신고 내용이 바뀝니다.</p>}
      <Button variant="secondary" disabled={proposalStale || generating} onClick={() => onApply(proposal.result.generatedText)}>이 내용 사용</Button>
    </section>}

    {factsChanged && <p className="inline-notice report-facts-notice" role="status"><Info size={17} aria-hidden="true" />기본 정보가 변경됐어요. 작성한 신고문이 현재 정보와 맞는지 다시 확인해 주세요.</p>}
    <FormField label="신고 내용" htmlFor="report-text" hint="직접 확인한 사실을 1~2,000자로 작성해 주세요. 생성된 제안은 내용을 확인한 뒤 선택해서 적용할 수 있어요."><textarea id="report-text" rows={7} maxLength={2000} value={text} placeholder="직접 확인한 위치와 통행에 불편을 주는 상황을 적어 주세요." onChange={event => onTextChange(event.target.value)} aria-describedby="report-text-hint" /><span className="character-count">{text.length} / 2,000</span></FormField>
    <label className="checkbox-label report-text-confirmation"><input type="checkbox" checked={confirmed} onChange={event => onConfirm(event.target.checked)} /><span>신고 내용을 확인했습니다.</span></label>
    <p className="field-hint">실제 상황과 다른 내용이 없는지 확인해 주세요. 내용을 수정하면 다시 확인해야 해요.</p>
  </div>;
}
