import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { config as loadEnvironment } from 'dotenv';
import type { ConverseSender } from '../src/services/ai/BedrockProvider.js';

export interface BedrockCheckConfig { region: string; modelId: string }
type CheckCode = 'INVALID_CONFIGURATION' | 'AWS_CREDENTIALS_UNAVAILABLE' | 'BEDROCK_ACCESS_DENIED' | 'BEDROCK_TIMEOUT' | 'BEDROCK_UNAVAILABLE' | 'BEDROCK_INVALID_RESPONSE';

export class BedrockConnectionCheckError extends Error {
  constructor(readonly code: CheckCode, message: string) { super(message); }
}

/** Explicit smoke check only. It neither enables application AI nor loads database settings. */
export function readBedrockCheckConfig(environment: NodeJS.ProcessEnv = process.env): BedrockCheckConfig {
  const region = environment.BEDROCK_REGION?.trim() || environment.AWS_REGION?.trim() || '';
  const modelId = environment.BEDROCK_REPORT_MODEL_ID?.trim() || '';
  if (region.length > 100 || !/^[a-z]{2,4}(?:-[a-z0-9]+)+-\d+$/.test(region)) {
    throw new BedrockConnectionCheckError('INVALID_CONFIGURATION', 'BEDROCK_REGION 또는 AWS_REGION을 설정하세요.');
  }
  // First-party base models only: no Marketplace subscription or cross-region profile side effects.
  if (modelId.length > 200 || !/^amazon\.[a-z0-9][a-z0-9._:-]*$/.test(modelId)) {
    throw new BedrockConnectionCheckError('INVALID_CONFIGURATION', '이 연결 검사는 Amazon 기본 모델 ID만 사용합니다. BEDROCK_REPORT_MODEL_ID를 확인하세요.');
  }
  return { region, modelId };
}

function tokenCount(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function checkBedrockConnection(configuration: BedrockCheckConfig, options: { sender?: ConverseSender; timeoutMs?: number } = {}) {
  const client = options.sender ? undefined : new BedrockRuntimeClient({ region: configuration.region, maxAttempts: 1 });
  const send: ConverseSender = options.sender ?? ((command, requestOptions) => client!.send(command, requestOptions));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      send(new ConverseCommand({
        modelId: configuration.modelId,
        messages: [{ role: 'user', content: [{ text: 'Reply only with OK.' }] }],
        inferenceConfig: { maxTokens: 16 },
      }), { abortSignal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new BedrockConnectionCheckError('BEDROCK_TIMEOUT', 'Bedrock 연결 확인 시간이 초과되었습니다.'));
        }, Math.min(15_000, Math.max(1, options.timeoutMs ?? 15_000)));
      }),
    ]);
    if (!['end_turn', 'stop_sequence', 'max_tokens'].includes(response.stopReason ?? '')
      || response.output?.message?.role !== 'assistant'
      || !response.output.message.content?.some(block => typeof block.text === 'string' && block.text.trim())) {
      throw new BedrockConnectionCheckError('BEDROCK_INVALID_RESPONSE', 'Bedrock 응답 형식을 확인하지 못했습니다.');
    }
    return {
      stopReason: response.stopReason,
      inputTokens: tokenCount(response.usage?.inputTokens), outputTokens: tokenCount(response.usage?.outputTokens),
    };
  } catch (error) {
    if (error instanceof BedrockConnectionCheckError) throw error;
    const name = error instanceof Error ? error.name : '';
    if (['CredentialsProviderError', 'TokenProviderError', 'ExpiredTokenException', 'ExpiredToken', 'UnrecognizedClientException', 'InvalidClientTokenId'].includes(name)) {
      throw new BedrockConnectionCheckError('AWS_CREDENTIALS_UNAVAILABLE', 'AWS 로그인 자격증명 또는 EC2 IAM 역할을 확인하세요.');
    }
    if (name === 'AccessDeniedException') {
      throw new BedrockConnectionCheckError('BEDROCK_ACCESS_DENIED', '모델 호출이 거부되었습니다. 해당 리전·모델의 bedrock:InvokeModel 권한과 모델 접근 상태를 확인하세요.');
    }
    if (controller.signal.aborted || ['TimeoutError', 'ModelTimeoutException'].includes(name)) {
      throw new BedrockConnectionCheckError('BEDROCK_TIMEOUT', 'Bedrock 연결 확인 시간이 초과되었습니다.');
    }
    throw new BedrockConnectionCheckError('BEDROCK_UNAVAILABLE', 'Bedrock 호출을 확인하지 못했습니다. 리전·모델 제공 상태와 연결을 확인하세요.');
  } finally {
    clearTimeout(timer);
    client?.destroy();
  }
}

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new BedrockConnectionCheckError('INVALID_CONFIGURATION', '추가 입력 없이 실행하세요. 실제 신고 내용은 받지 않습니다.');
  const loaded = loadEnvironment({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  const environmentError: unknown = loaded.error;
  if (environmentError && !(typeof environmentError === 'object' && 'code' in environmentError && environmentError.code === 'ENOENT')) {
    throw new BedrockConnectionCheckError('INVALID_CONFIGURATION', 'backend/.env를 읽지 못했습니다.');
  }
  const result = await checkBedrockConnection(readBedrockCheckConfig());
  console.info(JSON.stringify({ status: 'ok', service: 'bedrock', ...result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof BedrockConnectionCheckError ? `[${error.code}] ${error.message}` : 'Bedrock 연결을 확인하지 못했습니다. 설정과 인증을 확인하세요.');
    process.exitCode = 1;
  });
}
