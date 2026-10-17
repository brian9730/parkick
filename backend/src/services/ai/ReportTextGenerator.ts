import type { AppConfig } from '../../config.js';
import { generationFacts } from '../../prompts/reportGenerationPrompt.js';
import { AIProviderError } from './AIProvider.js';
import type { AIProvider, ReportGenerationInput, ReportGenerationResult } from './AIProvider.js';
import { BedrockProvider } from './BedrockProvider.js';
import type { ConverseSender } from './BedrockProvider.js';
import { MockAIProvider } from './MockAIProvider.js';

export interface AIServiceOptions {
  /** A controlled sender supports local tests without contacting AWS. */
  bedrockSender?: ConverseSender;
  timeoutMs?: number;
}

export class ReportTextGenerator {
  constructor(private readonly provider: AIProvider | null, private readonly timeoutMs = 30_000) {}

  static create(config: AppConfig, options: AIServiceOptions = {}): ReportTextGenerator {
    const provider = config.ai.mode === 'bedrock'
      ? new BedrockProvider(config.ai, options.bedrockSender)
      : config.ai.mode === 'mock' ? new MockAIProvider(config.environment) : null;
    return new ReportTextGenerator(provider, options.timeoutMs);
  }

  status(): { mode: 'mock' | 'bedrock' | 'disabled'; available: boolean } {
    // Configured availability only: this does not probe credentials, quota or model access.
    return { mode: this.provider?.mode ?? 'disabled', available: this.provider !== null };
  }

  async generate(input: ReportGenerationInput, signal?: AbortSignal): Promise<ReportGenerationResult> {
    if (!this.provider) throw new AIProviderError('AI_UNAVAILABLE');
    if (signal?.aborted) throw new AIProviderError('AI_ABORTED');
    const controller = new AbortController();
    const cancel = () => controller.abort(new AIProviderError('AI_ABORTED'));
    signal?.addEventListener('abort', cancel, { once: true });
    const deadline = setTimeout(() => controller.abort(new AIProviderError('AI_TIMEOUT')), this.timeoutMs);
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      // Race also enforces the deadline if a provider fails to honor its AbortSignal.
      const result = await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw controller.signal.reason;
          return this.provider!.generateReport(generationFacts(input), controller.signal);
        }),
        aborted,
      ]);
      if (!result.generatedText?.trim() || result.generatedText.length > 2000 || result.generatedText.includes('\0')) {
        throw new AIProviderError('AI_INVALID_RESPONSE');
      }
      return {
        mode: this.provider.mode, generatedText: result.generatedText.trim(),
        modelId: result.modelId, promptVersion: result.promptVersion, latencyMs: result.latencyMs,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      };
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError('AI_UNAVAILABLE');
    } finally {
      clearTimeout(deadline);
      signal?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', onAbort);
    }
  }
}
