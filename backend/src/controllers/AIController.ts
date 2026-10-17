import type { RequestHandler } from 'express';
import { z } from 'zod';
import { normalizeOperatorName } from '../catalog/operators.js';
import { ApiError } from '../middleware/errors.js';
import { AIProviderError } from '../services/ai/AIProvider.js';
import type { ReportTextGenerator } from '../services/ai/ReportTextGenerator.js';

const categories = ['보행로 통행 방해', '횡단보도 주변', '점자블록 위', '건물 출입구', '버스정류장 주변', '차도', '자전거도로', '킥보드가 넘어져 있음', '여러 대의 PM이 통행을 방해함', '기타'] as const;
const text = (max: number) => z.string().max(max).trim().refine(value => !value.includes('\0'));
const generationSchema = z.strictObject({
  operator: text(80).refine(value => value.length > 0).nullable().transform(normalizeOperatorName),
  deviceId: text(100).refine(value => value.length > 0).nullable(),
  address: text(300).refine(value => value.length > 0).nullable(),
  categories: z.array(z.enum(categories)).min(1).max(categories.length).refine(values => new Set(values).size === values.length),
  additionalDescription: text(500),
}).refine(input => !input.categories.includes('기타') || input.additionalDescription.length > 0);

const providerErrors = {
  AI_UNAVAILABLE: [503, '신고문 자동 작성을 사용할 수 없습니다. 잠시 후 다시 시도하거나 직접 작성해주세요.'],
  AI_TIMEOUT: [504, '신고문 작성 시간이 초과되었습니다. 다시 시도하거나 직접 작성해주세요.'],
  AI_INVALID_RESPONSE: [502, '완성된 신고문을 받지 못했습니다. 다시 시도하거나 직접 작성해주세요.'],
  AI_POLICY_REJECTED: [422, '입력한 내용으로 신고문을 작성하지 못했습니다. 내용을 확인하거나 직접 작성해주세요.'],
  AI_ABORTED: [499, '신고문 작성을 취소했습니다.'],
} as const;

export class AIController {
  constructor(private readonly service: ReportTextGenerator) {}

  status: RequestHandler = (_request, response) => {
    response.json({ data: this.service.status() });
  };

  generate: RequestHandler = async (request, response) => {
    const input = generationSchema.parse(request.body);
    const controller = new AbortController();
    const abort = () => { if (!response.writableEnded) controller.abort(); };
    request.once('aborted', abort);
    response.once('close', abort);
    if (request.aborted || response.destroyed) controller.abort();
    try {
      const result = await this.service.generate(input, controller.signal);
      if (!response.destroyed) response.json({ data: result });
    } catch (error) {
      if (response.destroyed) return;
      const code = error instanceof AIProviderError ? error.code : 'AI_UNAVAILABLE';
      const [status, message] = providerErrors[code];
      throw new ApiError(status, code, message);
    } finally {
      request.removeListener('aborted', abort);
      response.removeListener('close', abort);
    }
  };
}
