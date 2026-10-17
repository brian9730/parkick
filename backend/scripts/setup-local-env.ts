import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
import { assertDevelopmentOnly, assertTaskLocalDatabase, backendDirectory, localDatabaseUrl } from './local-database.js';

const editableKeys = ['DATABASE_URL', 'PHONE_ENCRYPTION_KEY', 'PHONE_LOOKUP_HMAC_KEY'] as const;
type EditableKey = typeof editableKeys[number];

/** Parse each assignment too: a duplicate blank key must not overwrite an earlier secret. */
export function fillBlankEnvironment(original: string, additions: Record<EditableKey, string>): { content: string; updatedKeys: EditableKey[] } {
  let content = original;
  const lineEnding = original.includes('\r\n') ? '\r\n' : '\n';
  const updatedKeys: EditableKey[] = [];
  for (const key of editableKeys) {
    const parsed = parse(content);
    const assignments = content.split(/\r?\n/).filter((line) => Object.hasOwn(parse(line), key));
    if (!parsed[key]?.trim() && assignments.some((line) => parse(line)[key]?.trim())) {
      throw new Error(`${key}가 중복되어 마지막 빈 값이 기존 값을 가리고 있습니다. 중복 항목을 정리한 뒤 다시 실행해주세요. 파일은 변경하지 않았습니다.`);
    }
    if (parsed[key]?.trim()) continue;
    const quoted = JSON.stringify(additions[key]);
    const pattern = new RegExp(`^(\\uFEFF?[\\t ]*(?:export[\\t ]+)?${key}[\\t ]*=[\\t ]*)([^\\r\\n]*)(\\r?)$`, 'gm');
    let matched = false;
    content = content.replace(pattern, (_line: string, prefix: string, oldValue: string, carriageReturn: string) => {
      matched = true;
      // For an empty dotenv value, any hash outside its empty quotes begins a comment.
      const commentIndex = oldValue.indexOf('#');
      const comment = commentIndex >= 0 ? ` ${oldValue.slice(commentIndex)}` : '';
      return `${prefix}${quoted}${comment}${carriageReturn}`;
    });
    if (!matched) content += `${content.endsWith('\n') || !content ? '' : lineEnding}${key}=${quoted}${lineEnding}`;
    updatedKeys.push(key);
  }
  return { content, updatedKeys };
}

export async function setupLocalEnvironment(): Promise<void> {
  assertDevelopmentOnly();
  const envPath = resolve(backendDirectory, '.env');
  let original: Buffer;
  let exists = true;
  try { original = await readFile(envPath); }
  catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
    exists = false;
    original = await readFile(resolve(backendDirectory, '.env.example'));
  }
  const current = parse(original);
  if (current.NODE_ENV === 'production') throw new Error('운영 환경의 .env에는 로컬 개발 설정을 추가할 수 없습니다.');
  const databaseUrl = process.env.PARKICK_LOCAL_DATABASE_URL || localDatabaseUrl;
  assertTaskLocalDatabase(databaseUrl);
  let encryptionKey = current.PHONE_ENCRYPTION_KEY?.trim() || randomBytes(32).toString('base64');
  let lookupKey = current.PHONE_LOOKUP_HMAC_KEY?.trim() || randomBytes(32).toString('base64');
  if (current.PHONE_ENCRYPTION_KEY?.trim() && current.PHONE_LOOKUP_HMAC_KEY?.trim() && encryptionKey === lookupKey) {
    throw new Error('기존 전화번호 암호화 키와 조회 키가 같습니다. 서로 다른 키를 설정해주세요. 기존 값은 변경하지 않았습니다.');
  }
  while (lookupKey === encryptionKey) {
    if (current.PHONE_LOOKUP_HMAC_KEY?.trim()) encryptionKey = randomBytes(32).toString('base64');
    else lookupKey = randomBytes(32).toString('base64');
  }
  const additions = {
    DATABASE_URL: databaseUrl,
    PHONE_ENCRYPTION_KEY: encryptionKey,
    PHONE_LOOKUP_HMAC_KEY: lookupKey,
  };
  const result = fillBlankEnvironment(original.toString('utf8'), additions);
  if (exists && result.updatedKeys.length === 0) {
    console.info('기존 로컬 환경설정을 유지했습니다.');
    return;
  }
  // Only the three blank values change; all other bytes, comments, line endings and secrets survive.
  const temporaryPath = `${envPath}.setup-${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, result.content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    if (exists && !(await readFile(envPath)).equals(original)) {
      throw new Error('.env가 동시에 수정되어 작업을 중단했습니다. 다시 실행해주세요.');
    }
    if (!exists) {
      // Do not replace a file another process created after the initial read.
      await writeFile(envPath, result.content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } else {
      await rename(temporaryPath, envPath);
    }
    console.info(`로컬 환경설정 준비 완료. 설정된 항목: ${result.updatedKeys.join(', ') || '없음'} (값은 출력하지 않습니다).`);
  } finally {
    await unlink(temporaryPath).catch((error: unknown) => {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  setupLocalEnvironment().catch((error: unknown) => {
    // FS errors may include paths but never print environment contents or database URL values.
    console.error(error instanceof Error && !('code' in error) ? error.message : '로컬 환경설정 파일을 준비하지 못했습니다.');
    process.exitCode = 1;
  });
}
