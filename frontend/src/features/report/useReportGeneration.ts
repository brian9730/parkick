import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { generateReport, getAiStatus } from '../../api/ai';
import type { AiReportInput, AiReportResult, AiStatus } from '../../api/ai';

interface ServiceState { attempt: number; status: AiStatus | null; error: string | null }
export interface ReportProposal { result: AiReportResult; sourceKey: string }

/** This hook lives in ReportPage, preserving completed proposals while individual steps unmount. */
export function useReportGeneration(active: boolean, input: AiReportInput, sourceKey: string) {
  const [service, setService] = useState<ServiceState | null>(null);
  const [serviceAttempt, setServiceAttempt] = useState(0);
  const [proposal, setProposal] = useState<ReportProposal | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

  const abortRequest = useCallback(() => {
    requestVersion.current += 1;
    const pending = controller.current;
    controller.current = null;
    pending?.abort();
    return pending !== null;
  }, []);

  useEffect(() => () => { abortRequest(); }, [abortRequest, active]);

  useEffect(() => {
    if (!active || service?.attempt === serviceAttempt) return;
    const request = new AbortController();
    void getAiStatus(request.signal).then(status => {
      if (!request.signal.aborted) setService({ attempt: serviceAttempt, status, error: null });
    }).catch(cause => {
      if (!request.signal.aborted) setService({ attempt: serviceAttempt, status: null, error: cause instanceof Error ? cause.message : '자동 작성 설정을 확인하지 못했어요.' });
    });
    return () => request.abort();
  }, [active, service, serviceAttempt]);

  function cancel(message = '생성을 취소했어요. 신고 내용을 직접 작성하거나 다시 생성할 수 있어요.') {
    const wasPending = abortRequest();
    setGenerating(false);
    if (wasPending) setNotice(message);
  }

  async function generate() {
    const status = service?.attempt === serviceAttempt ? service.status : null;
    if (!active || controller.current || !status?.available || status.mode === 'disabled') return;
    const request = new AbortController();
    const version = ++requestVersion.current;
    controller.current = request;
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const result = await generateReport(input, request.signal);
      if (request.signal.aborted || version !== requestVersion.current) return;
      setProposal({ result, sourceKey });
    } catch (cause) {
      if (request.signal.aborted || version !== requestVersion.current) return;
      setError(cause instanceof ApiError && cause.status === 429
        ? '생성 요청이 많아요. 잠시 후 다시 시도하거나 직접 작성해 주세요.'
        : cause instanceof Error ? cause.message : '신고문을 생성하지 못했어요. 다시 시도하거나 직접 작성해 주세요.');
    } finally {
      if (version === requestVersion.current) {
        controller.current = null;
        setGenerating(false);
      }
    }
  }

  return {
    status: service?.attempt === serviceAttempt ? service.status : null,
    serviceLoading: service?.attempt !== serviceAttempt,
    serviceError: service?.attempt === serviceAttempt ? service.error : null,
    refreshStatus: () => setServiceAttempt(previous => previous + 1),
    proposal, generating, error, notice, generate, cancel,
    proposalStale: proposal !== null && proposal.sourceKey !== sourceKey,
  };
}

export type ReportGenerationController = ReturnType<typeof useReportGeneration>;
