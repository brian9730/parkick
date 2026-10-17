import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { findOperator, getOperator, matchingOperatorAliases, normalizeOperatorName, OPERATORS } from '../src/catalog/operators.js';
import { reportSubmissionSchema } from '../src/services/reports/reportInput.js';
import { QRParsingService } from '../src/services/qr/QRParsingService.js';

describe('Shared operator catalog', () => {
  it('normalizes codes, display names and aliases to the same six canonical names', () => {
    assert.deepEqual(OPERATORS.map(operator => [operator.id, operator.name]), [
      ['gcoo', '지쿠'], ['beam', '빔'], ['kakao-bike', '카카오 T 바이크'],
      ['elecle', '쏘카 일레클'], ['alpaca', '알파카'], ['swing', '스윙'],
    ]);
    for (const operator of OPERATORS) {
      assert.equal(getOperator(operator.id), operator);
      for (const alias of [operator.id, operator.name, ...operator.aliases]) {
        assert.equal(normalizeOperatorName(alias), operator.name);
        assert.equal(normalizeOperatorName(` ${alias.toUpperCase()} `), operator.name);
        assert.equal(findOperator(alias)?.id, operator.id);
      }
    }
    for (const custom of ['다른 지역 업체', 'beam-example', 'kakao-bike.example', '  기존 업체명  ', '']) {
      assert.equal(normalizeOperatorName(custom), custom);
      assert.equal(findOperator(custom), null);
    }
    assert.equal(normalizeOperatorName(null), null);
    assert.throws(() => getOperator('unregistered'), /Unknown registered operator/);
  });

  it('normalizes submission names without rejecting legacy custom companies or changing other facts', () => {
    const original = {
      submissionId: randomUUID(), operator: 'kakao-bike', deviceId: 'AB1234', qrRawData: null,
      latitude: 37.5665, longitude: 126.978, address: null, categories: ['차도'], additionalDescription: '',
      finalReportText: '이 신고문 원문은 변경하지 않습니다.', phone: null, consent: false, reportConfirmed: true,
    };
    for (const operator of OPERATORS) {
      for (const alias of [operator.id, operator.name, ...operator.aliases]) {
        const result = reportSubmissionSchema.parse({ ...original, operator: alias });
        assert.deepEqual(result, { ...original, operator: operator.name });
      }
    }
    assert.equal(reportSubmissionSchema.parse({ ...original, operator: '기타 기존 업체' }).operator, '기타 기존 업체');
    assert.equal(reportSubmissionSchema.parse({ ...original, operator: null }).operator, null);
    assert.equal(reportSubmissionSchema.parse({ ...original, operator: '   ' }).operator, null);
    assert.equal(reportSubmissionSchema.safeParse({ ...original, operator: 'x'.repeat(81) }).success, false);
  });

  it('uses catalog identities in every verified QR parser without registering unsupported formats', () => {
    const service = new QRParsingService();
    for (const [rawQr, id] of [
      ['https://t.kakao.com/launch?type=bike&ref=qrcode&id=ab1234', 'kakao-bike'],
      ['https://deeplink.ridebeam.com?code=7654321', 'beam'],
      ['https://open.gbike.io/?b=1234567890', 'gcoo'],
    ]) {
      const parsed = service.parse(rawQr!);
      assert.equal(parsed.operatorId, id);
      assert.equal(parsed.operatorName, getOperator(id!).name);
    }
    for (const id of ['elecle', 'alpaca', 'swing']) assert.equal(service.parse(id).matched, false);
  });

  it('expands known name searches to legacy aliases without treating lookalikes as known aliases', () => {
    assert.ok(matchingOperatorAliases('카카오').includes('kakao-bike'));
    assert.ok(matchingOperatorAliases('KAKAO-BIKE').includes('카카오 T 바이크'));
    assert.ok(matchingOperatorAliases('일레클').includes('elecle'));
    assert.deepEqual(matchingOperatorAliases('beam-example'), []);
    assert.deepEqual(matchingOperatorAliases(''), []);
  });
});
