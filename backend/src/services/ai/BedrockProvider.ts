import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { performance } from 'node:perf_hooks';
import { REPORT_PROMPT_VERSION, REPORT_SYSTEM_PROMPT, reportGenerationPrompt } from '../../prompts/reportGenerationPrompt.js';
import { AIProviderError } from './AIProvider.js';
import type { AIProvider, ReportGenerationInput, ReportGenerationResult } from './AIProvider.js';

export type ConverseSender = (command: ConverseCommand, options: { abortSignal: AbortSignal }) => Promise<ConverseCommandOutput>;

function measuredTokens(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** AWS credentials come exclusively from the standard SDK credential provider chain. */
export class BedrockProvider implements AIProvider {
  readonly mode = 'bedrock';
  private readonly send: ConverseSender;

  constructor(private readonly configuration: { region: string; modelId: string }, sender?: ConverseSender) {
    if (!configuration.region.trim() || !configuration.modelId.trim()) throw new Error('Bedrock Region과 Model ID가 필요합니다.');
    if (sender) this.send = sender;
    else {
      const client = new BedrockRuntimeClient({ region: configuration.region, maxAttempts: 1 });
      this.send = (command, options) => client.send(command, options);
    }
  }

  async generateReport(input: ReportGenerationInput, signal?: AbortSignal): Promise<ReportGenerationResult> {
    const abortSignal = signal ?? new AbortController().signal;
    if (abortSignal.aborted) throw new AIProviderError('AI_ABORTED');
    const started = performance.now();
    try {
      const response = await this.send(new ConverseCommand({
        modelId: this.configuration.modelId,
        system: [{ text: REPORT_SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: reportGenerationPrompt(input) }] }],
        inferenceConfig: { maxTokens: 1500 },
      }), { abortSignal });
      if (abortSignal.aborted) throw new AIProviderError('AI_ABORTED');
      if (response.stopReason === 'guardrail_intervened' || response.stopReason === 'content_filtered') {
        throw new AIProviderError('AI_POLICY_REJECTED');
      }
      if (!['end_turn', 'stop_sequence'].includes(response.stopReason ?? '')) throw new AIProviderError('AI_INVALID_RESPONSE');
      const message = response.output?.message;
      if (message?.role !== 'assistant' || !message.content?.length) throw new AIProviderError('AI_INVALID_RESPONSE');
      const parts: string[] = [];
      for (const block of message.content) {
        if (typeof block.text !== 'string' || Object.keys(block).some(key => key !== 'text')) {
          throw new AIProviderError('AI_INVALID_RESPONSE');
        }
        parts.push(block.text);
      }
      const generatedText = parts.join('').trim();
      if (!generatedText || generatedText.length > 2000 || generatedText.includes('\0')) throw new AIProviderError('AI_INVALID_RESPONSE');
      return {
        mode: this.mode, generatedText, modelId: this.configuration.modelId,
        promptVersion: REPORT_PROMPT_VERSION, latencyMs: Math.max(0, Math.round(performance.now() - started)),
        inputTokens: measuredTokens(response.usage?.inputTokens), outputTokens: measuredTokens(response.usage?.outputTokens),
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (abortSignal.aborted) throw new AIProviderError('AI_ABORTED');
      const name = error instanceof Error ? error.name : '';
      if (name === 'ModelTimeoutException' || name === 'TimeoutError') throw new AIProviderError('AI_TIMEOUT');
      // Do not attach causes, SDK metadata, error messages or input facts.
      throw new AIProviderError('AI_UNAVAILABLE');
    }
  }
}
