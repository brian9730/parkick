import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { BedrockConnectionCheckError, checkBedrockConnection, readBedrockCheckConfig } from '../scripts/check-bedrock.js';

const configuration = { region: 'us-east-1', modelId: 'amazon.nova-micro-v1:0' };
const response: ConverseCommandOutput = {
  $metadata: {}, stopReason: 'end_turn',
  output: { message: { role: 'assistant', content: [{ text: 'OK' }] } },
  usage: { inputTokens: 9, outputTokens: 1, totalTokens: 10 },
};

describe('explicit Bedrock connection probe without AWS calls', () => {
  it('accepts an independent AI region while rejecting missing models, third parties, and cross-region profiles', () => {
    assert.deepEqual(readBedrockCheckConfig({ AWS_REGION: 'ap-northeast-2', BEDROCK_REGION: ' us-east-1 ', BEDROCK_REPORT_MODEL_ID: configuration.modelId, AI_PROVIDER: 'disabled' }), configuration);
    assert.deepEqual(readBedrockCheckConfig({ AWS_REGION: 'us-east-1', BEDROCK_REPORT_MODEL_ID: configuration.modelId }), configuration);
    assert.throws(() => readBedrockCheckConfig({}), BedrockConnectionCheckError);
    for (const modelId of ['', 'anthropic.unapproved-model', 'us.amazon.nova-micro-v1:0', 'arn:aws:bedrock:us-east-1:123456789012:inference-profile/test']) {
      assert.throws(() => readBedrockCheckConfig({ BEDROCK_REGION: 'us-east-1', BEDROCK_REPORT_MODEL_ID: modelId }), BedrockConnectionCheckError);
    }
  });

  it('sends one small fixed synthetic message and returns usage without returning generated text', async () => {
    let calls = 0;
    const result = await checkBedrockConnection(configuration, { sender: async (command, options) => {
      calls += 1;
      assert.equal(options.abortSignal.aborted, false);
      assert.deepEqual(command.input, {
        modelId: configuration.modelId,
        messages: [{ role: 'user', content: [{ text: 'Reply only with OK.' }] }],
        inferenceConfig: { maxTokens: 16 },
      });
      return response;
    } });
    assert.equal(calls, 1);
    assert.deepEqual(result, { stopReason: 'end_turn', inputTokens: 9, outputTokens: 1 });
  });

  it('reports credential and permission failures without exposing SDK error details or retrying', async () => {
    for (const [name, code] of [['CredentialsProviderError', 'AWS_CREDENTIALS_UNAVAILABLE'], ['AccessDeniedException', 'BEDROCK_ACCESS_DENIED'], ['ValidationException', 'BEDROCK_UNAVAILABLE']] as const) {
      let calls = 0;
      await assert.rejects(checkBedrockConnection(configuration, { sender: async () => {
        calls += 1;
        throw Object.assign(new Error('PRIVATE_CREDENTIAL_OR_PROVIDER_DETAIL'), { name });
      } }), error => error instanceof BedrockConnectionCheckError && error.code === code && !error.message.includes('PRIVATE_'));
      assert.equal(calls, 1);
    }
  });

  it('aborts on deadline even when the SDK sender ignores cancellation', async () => {
    let observed: AbortSignal | undefined;
    await assert.rejects(checkBedrockConnection(configuration, {
      timeoutMs: 5,
      sender: async (_command, options) => {
        observed = options.abortSignal;
        return new Promise<ConverseCommandOutput>(() => {});
      },
    }), error => error instanceof BedrockConnectionCheckError && error.code === 'BEDROCK_TIMEOUT');
    assert.equal(observed?.aborted, true);
  });

  it('rejects responses that do not contain a successful assistant text result', async () => {
    for (const result of [{ ...response, stopReason: 'guardrail_intervened' as const }, { ...response, output: undefined }]) {
      await assert.rejects(checkBedrockConnection(configuration, { sender: async () => result }),
        error => error instanceof BedrockConnectionCheckError && error.code === 'BEDROCK_INVALID_RESPONSE');
    }
  });
});
