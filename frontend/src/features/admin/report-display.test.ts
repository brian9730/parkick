import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AdminReportSummary } from '../../api/admin';
import { adminReportJurisdiction } from './report-display';

const demo = { id: 'demo', name: '개발용 (시연 데이터)' };
const report = (address: string | null): Pick<AdminReportSummary, 'tenant' | 'region' | 'address'> => ({
  tenant: demo, region: demo, address,
});

test('demo jurisdiction displays the municipality from the submitted address without claiming an assigned tenant', () => {
  assert.deepEqual(adminReportJurisdiction(report('경기도 용인시 수지구 상현동 1193-2')), {
    tenantName: null, regionName: '경기도 용인',
  });
  assert.equal(adminReportJurisdiction(report('경기 수원시 영통구')).regionName, '경기도 수원');
  assert.equal(adminReportJurisdiction(report('서울특별시 강남구 역삼동')).regionName, '서울 강남');
});

test('unrecognized demo address does not claim a municipality; registered names remain intact', () => {
  assert.equal(adminReportJurisdiction(report('용인 근처')).regionName, '신고 지역 미확인');
  assert.equal(adminReportJurisdiction(report(null)).regionName, '신고 지역 미확인');
  assert.deepEqual(adminReportJurisdiction({
    tenant: { id: 'tenant', name: '용인시청' },
    region: { id: 'region', name: '경기도 용인시' },
    address: '경기도 수원시',
  }), { tenantName: '용인시청', regionName: '경기도 용인시' });
});
