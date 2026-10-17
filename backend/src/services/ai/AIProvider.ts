/** Text-only facts supplied by the reporter. Evidence photos and contact details are excluded. */
export interface ReportGenerationInput {
  operator: string | null;
  deviceId: string | null;
  address: string | null;
  categories: readonly string[];
  additionalDescription: string;
}

export interface ReportGenerationResult {
  mode: 'mock' | 'bedrock';
  generatedText: string;
  modelId: string;
  promptVersion: string;
  /** Only observed provider values; unavailable metrics are null, never estimated. */
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Provider failures contain only fixed codes; never expose SDK errors or user input. */
export class AIProviderError extends Error {
  constructor(readonly code: 'AI_UNAVAILABLE' | 'AI_TIMEOUT' | 'AI_INVALID_RESPONSE' | 'AI_POLICY_REJECTED' | 'AI_ABORTED') {
    super(code);
    this.name = 'AIProviderError';
  }
}

/** Text generation only. A failed real provider must never silently fall back to a mock. */
export interface AIProvider {
  readonly mode: 'mock' | 'bedrock';
  generateReport(input: ReportGenerationInput, signal?: AbortSignal): Promise<ReportGenerationResult>;
}
