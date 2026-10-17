import { ApiError, apiRequest } from './client';

export interface AiStatus {
  mode: 'mock' | 'bedrock' | 'disabled';
  available: boolean;
}

export interface AiReportInput {
  operator: string | null;
  deviceId: string | null;
  address: string | null;
  categories: string[];
  additionalDescription: string;
}

export interface AiReportResult {
  mode: 'mock' | 'bedrock';
  generatedText: string;
  modelId: string;
  promptVersion: string;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function getAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  const status = await apiRequest<AiStatus>('/ai/status', { signal });
  if (!status || !['mock', 'bedrock', 'disabled'].includes(status.mode) || typeof status.available !== 'boolean') {
    throw new ApiError('자동 작성 설정을 확인하지 못했어요. 직접 작성하거나 다시 확인해 주세요.', 502, 'INVALID_AI_STATUS');
  }
  return status;
}

export async function generateReport(input: AiReportInput, signal: AbortSignal): Promise<AiReportResult> {
  // Build the outbound object explicitly: never serialize the report draft or its private evidence.
  const body: AiReportInput = {
    operator: input.operator,
    deviceId: input.deviceId,
    address: input.address,
    categories: [...input.categories],
    additionalDescription: input.additionalDescription,
  };
  const result = await apiRequest<AiReportResult>('/ai/generate-report', { method: 'POST', body: JSON.stringify(body), signal, timeoutMs: 35_000 });
  if (!result || !['mock', 'bedrock'].includes(result.mode) || typeof result.generatedText !== 'string'
    || !result.generatedText.trim() || result.generatedText.length > 2000) {
    throw new ApiError('생성된 문구를 확인하지 못했어요. 다시 시도하거나 직접 작성해 주세요.', 502, 'INVALID_AI_REPORT');
  }
  return result;
}
