import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import type { UploadProgress } from '../../api/client';
import { getReportServiceStatus, submitReport } from '../../api/reports';
import type { ReportServiceStatus, ReportSubmissionInput } from '../../api/reports';
import { createPhotoId } from '../photos/validation';
import type { PhotoEvidence } from '../photos/usePhotoEvidence';
import type { ReportReceipt } from './receipt';

interface ServiceState { attempt: number; status: ReportServiceStatus | null; error: string | null }
type SubmissionResult = { receipt: ReportReceipt; error: null } | { receipt: null; error: ApiError | null };

export function useReportSubmission(active: boolean) {
  const [service, setService] = useState<ServiceState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const identity = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => {
    if (!active || service?.attempt === attempt) return;
    const controller = new AbortController();
    void getReportServiceStatus(controller.signal).then(status => {
      if (!controller.signal.aborted) setService({ attempt, status, error: null });
    }).catch(cause => {
      if (!controller.signal.aborted) setService({ attempt, status: null, error: cause instanceof Error ? cause.message : '접수 가능 여부를 확인하지 못했어요.' });
    });
    return () => controller.abort();
  }, [active, attempt, service]);

  async function submit(input: ReportSubmissionInput, photos: PhotoEvidence[]): Promise<SubmissionResult> {
    if (request.current || !active || service?.attempt !== attempt || !service.status?.available || service.status.mode === 'disabled') return { receipt: null, error: null };
    const signature = JSON.stringify({ input, photos: photos.map(photo => photo.id) });
    if (identity.current?.signature !== signature) identity.current = { signature, id: createPhotoId() };
    const controller = new AbortController();
    request.current = controller;
    setSubmitting(true);
    setProgress(null);
    setError('');
    try {
      const receipt = await submitReport(input, identity.current.id, photos.map(photo => photo.file), controller.signal, next => {
        if (!controller.signal.aborted) setProgress(next);
      });
      return { receipt, error: null };
    } catch (cause) {
      if (controller.signal.aborted) return { receipt: null, error: null };
      setError(cause instanceof ApiError && (cause.code === 'REQUEST_TIMEOUT' || cause.status === 0)
        ? '접수 결과를 확인하지 못했어요. 이미 접수되었을 수 있으니 내용을 바꾸지 않고 다시 제출해 주세요. 같은 내용은 중복 접수되지 않아요.'
        : cause instanceof Error ? cause.message : '신고를 제출하지 못했어요. 입력한 내용은 유지됩니다. 다시 시도해 주세요.');
      return { receipt: null, error: cause instanceof ApiError ? cause : null };
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) {
        setSubmitting(false);
        setProgress(null);
      }
    }
  }

  return {
    status: service?.attempt === attempt ? service.status : null,
    serviceLoading: service?.attempt !== attempt,
    serviceError: service?.attempt === attempt ? service.error : null,
    refreshStatus: () => setAttempt(previous => previous + 1),
    submitting, progress, error, clearError: () => setError(''), submit,
  };
}
