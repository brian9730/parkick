import { performance } from 'node:perf_hooks';
import type { AppConfig } from '../../config.js';
import { REPORT_PROMPT_VERSION, generationFacts } from '../../prompts/reportGenerationPrompt.js';
import { AIProviderError } from './AIProvider.js';
import type { AIProvider, ReportGenerationInput, ReportGenerationResult } from './AIProvider.js';

/** Deterministic development template: no model call and no fabricated token measurements. */
export class MockAIProvider implements AIProvider {
  readonly mode = 'mock';

  constructor(environment: AppConfig['environment']) {
    if (environment === 'production') throw new Error('운영 환경에서는 MOCK AI를 사용할 수 없습니다.');
  }

  async generateReport(input: ReportGenerationInput, signal?: AbortSignal): Promise<ReportGenerationResult> {
    if (signal?.aborted) throw new AIProviderError('AI_ABORTED');
    const started = performance.now();
    const facts = generationFacts(input);
    const lines = [
      facts.address ? `${facts.address}의 공유 PM 주차 상황을 신고합니다.` : '공유 PM 주차 상황을 신고합니다.',
      ...(facts.operator ? [`운영업체: ${facts.operator}.`] : []),
      ...(facts.deviceId ? [`기기번호: ${facts.deviceId}.`] : []),
      `확인한 불편 사항: ${facts.categories.join(', ')}.`,
      ...(facts.additionalDescription ? [`추가 설명: ${facts.additionalDescription}`] : []),
      '현장을 확인하고 필요한 조치를 검토해 주세요.',
    ];
    return {
      mode: this.mode, generatedText: lines.join('\n'), modelId: 'mock-template-v1',
      promptVersion: REPORT_PROMPT_VERSION, latencyMs: Math.max(0, Math.round(performance.now() - started)),
      inputTokens: null, outputTokens: null,
    };
  }
}
