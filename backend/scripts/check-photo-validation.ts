import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadEnvironment } from 'dotenv';
import sharp from 'sharp';
import { readConfig } from '../src/config.js';
import { ApiError } from '../src/middleware/errors.js';
import { PhotoValidationService } from '../src/services/reports/PhotoValidationService.js';
import { prepareEvidence } from '../src/services/storage/prepareEvidence.js';

/** This checks the image-capable model with generated unrelated art, never a user's report photo. */
async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('추가 입력 없이 실행하세요.');
  const loaded = loadEnvironment({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  const environmentError: unknown = loaded.error;
  if (environmentError && !(typeof environmentError === 'object' && 'code' in environmentError && environmentError.code === 'ENOENT')) {
    throw new Error('backend/.env를 읽지 못했습니다.');
  }
  const config = readConfig({ ...process.env, NODE_ENV: 'test', AI_PROVIDER: 'bedrock', DATABASE_URL: '', ENABLE_DEV_ADMIN: 'false' });
  const svg = Buffer.from('<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="white"/><circle cx="250" cy="276" r="125" fill="#d82929"/><path d="M250 148 Q267 100 321 104 Q308 146 250 148" fill="#258331"/><text x="140" y="470" font-size="44" fill="black">RED APPLE</text></svg>');
  const image = await sharp(svg).jpeg({ quality: 85 }).toBuffer();
  const photos = await prepareEvidence([{ originalname: 'generated-apple.jpg', mimetype: 'image/jpeg', buffer: image }]);
  try {
    await PhotoValidationService.create(config).validate(photos);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'PHOTO_NOT_PM') {
      console.info(JSON.stringify({ status: 'ok', service: 'bedrock-photo-validation', verdict: 'unrelated' }));
      return;
    }
    throw new Error('사진 판정 모델을 확인하지 못했습니다. AWS 자격증명, 리전, 모델 접근 및 권한을 확인하세요.');
  }
  throw new Error('모델이 관련 없는 테스트 이미지를 거부하지 않았습니다. 모델과 분류 지침을 확인하세요.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : '사진 판정 연결을 확인하지 못했습니다.');
    process.exitCode = 1;
  });
}
