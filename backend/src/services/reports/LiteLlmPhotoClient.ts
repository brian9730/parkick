import type { AIConfig } from '../../config.js';

export type LiteLlmSender = (url: string, init: RequestInit) => Promise<Response>;

/** Calls the server-side LiteLLM proxy with normalized JPEGs only. */
export class LiteLlmPhotoClient {
  private readonly send: LiteLlmSender;

  constructor(private readonly config: Extract<AIConfig, { mode: 'litellm' }>, sender?: LiteLlmSender) {
    this.send = sender ?? fetch;
  }

  async classify(images: readonly Uint8Array[], systemPrompt: string, signal: AbortSignal): Promise<string> {
    const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
      { type: 'text', text: `There are ${images.length} photos. Return exactly ${images.length} labels in {"labels":[...]} JSON.` },
    ];
    for (let index = 0; index < images.length; index += 1) {
      content.push({ type: 'text', text: `Photo ${index + 1}:` });
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from(images[index]!).toString('base64')}` } });
    }
    const response = await this.send(`${this.config.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-litellm-api-key': this.config.apiKey },
      body: JSON.stringify({
        model: this.config.modelId,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content }],
        temperature: 0,
        max_tokens: 120,
      }),
      signal,
      redirect: 'error',
    });
    if (!response.ok) throw new Error('LiteLLM request failed.');
    const raw = await response.text();
    if (raw.length > 64 * 1024) throw new Error('LiteLLM response too large.');
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || !('choices' in payload) || !Array.isArray(payload.choices)) {
      throw new Error('Invalid LiteLLM response.');
    }
    const choice: unknown = payload.choices[0];
    if (!choice || typeof choice !== 'object' || !('finish_reason' in choice) || choice.finish_reason !== 'stop'
      || !('message' in choice) || !choice.message || typeof choice.message !== 'object'
      || !('content' in choice.message) || typeof choice.message.content !== 'string' || !choice.message.content.trim()) {
      throw new Error('Invalid LiteLLM completion.');
    }
    return choice.message.content;
  }
}
