import { config } from 'dotenv';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { assertTaskLocalDatabase, backendDirectory } from '../scripts/local-database.js';

export const localCategories = [
  ['SIDEWALK_OBSTRUCTION', '보행로 통행 방해'],
  ['CROSSWALK', '횡단보도 주변'],
  ['TACTILE_PAVING', '점자블록 위'],
  ['BUILDING_ENTRANCE', '건물 출입구'],
  ['BUS_STOP', '버스정류장 주변'],
  ['ROADWAY', '차도'],
  ['BICYCLE_LANE', '자전거도로'],
  ['FALLEN_PM', '킥보드가 넘어져 있음'],
  ['MULTIPLE_PM', '여러 대의 PM이 통행을 방해함'],
  ['OTHER', '기타'],
] as const;

const localDevelopmentName = '개발용 (시연 데이터)';

/** Explicit demo ownership only; these names do not claim to represent an actual government. */
export async function seedLocalDevelopment(client: PrismaClient): Promise<void> {
  await client.$transaction(async (transaction) => {
    const tenant = await transaction.tenant.upsert({
      where: { code: 'local-development' },
      create: { code: 'local-development', name: localDevelopmentName },
      update: { name: localDevelopmentName },
    });
    const region = await transaction.region.upsert({
      where: { code: 'local-development' },
      create: { code: 'local-development', name: localDevelopmentName, tenantId: tenant.id },
      update: { name: localDevelopmentName },
    });
    if (region.tenantId !== tenant.id) throw new Error('로컬 개발용 지역과 기관의 연결이 올바르지 않습니다.');
    for (const [sortOrder, [code, name]] of localCategories.entries()) {
      await transaction.reportCategory.upsert({
        where: { code },
        create: { code, name, sortOrder },
        update: { name, sortOrder },
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  config({ path: resolve(backendDirectory, '.env'), quiet: true });
  let client: PrismaClient | undefined;
  try {
    assertTaskLocalDatabase(process.env.DATABASE_URL, true);
    client = new PrismaClient();
    await seedLocalDevelopment(client);
    console.info('로컬 기관·지역 및 신고 유형 10개 준비 완료. 신고·관리자 시연 기록은 생성하지 않았습니다.');
  } catch {
    console.error('로컬 초기 데이터 준비에 실패했습니다. DB 대상, 마이그레이션 적용 여부를 확인해주세요.');
    process.exitCode = 1;
  } finally {
    await client?.$disconnect();
  }
}
