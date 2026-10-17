import { PrismaClient } from '../backend/src/generated/prisma/client.js';
import { seedLocalDevelopment } from '../backend/prisma/seed.js';

/** Explicit initial deployment demo data. Does not create administrators or real jurisdictions. */
function assertDeploymentDemoTarget(): void {
  if (process.env.NODE_ENV !== 'production' || process.env.REPORT_REGION_CODE !== 'local-development') {
    throw new Error('운영 모드와 명시적인 local-development 시연 지역 설정이 필요합니다.');
  }
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? ''); }
  catch { throw new Error('배포용 PostgreSQL 연결 설정을 확인해주세요.'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || (url.port && url.port !== '5432')
    || url.pathname !== '/parkick'
    || url.username !== 'parkick_app'
    || !url.password
    || url.hash
    || [...url.searchParams.keys()].some((key) => key !== 'schema')
    || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error('초기 배포용 seed는 같은 서버의 parkick DB와 parkick_app 계정만 지원합니다.');
  }
}

let client: PrismaClient | undefined;
try {
  assertDeploymentDemoTarget();
  client = new PrismaClient();
  await seedLocalDevelopment(client);
  console.info('배포 시연용 기관·지역과 신고 유형 10개를 준비했습니다. 실제 관할·관리자 계정·신고 기록은 생성하지 않았습니다.');
} catch {
  console.error('배포 시연용 초기 데이터 설정에 실패했습니다. 운영 환경변수와 마이그레이션 적용 여부를 확인해주세요.');
  process.exitCode = 1;
} finally {
  await client?.$disconnect();
}
