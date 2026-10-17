import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BeamQRParser } from '../src/services/qr/BeamQRParser.js';
import { GcooQRParser } from '../src/services/qr/GcooQRParser.js';
import { KakaoBikeQRParser } from '../src/services/qr/KakaoBikeQRParser.js';
import { OperatorMatcher } from '../src/services/qr/OperatorMatcher.js';
import { QRParsingService } from '../src/services/qr/QRParsingService.js';

const kakaoQr = 'https://t.kakao.com/launch?type=bike&ref=qrcode&id=ab1234';
const beamQr = 'https://deeplink.ridebeam.com?code=7654321';
const gcooQr = 'https://open.gbike.io/?b=1234567890';
const gcooPrintedNumberQr = 'https://open.gbike.io/?b=08201654321';

function assertUnknown(rawQr: string, selectedOperatorId?: string): void {
  assert.deepEqual(new QRParsingService().parse(rawQr, selectedOperatorId), {
    rawQr, operatorId: null, operatorName: null, deviceId: null,
    parserId: 'generic-unknown', matched: false, source: 'unknown', reason: 'UNVERIFIED_QR_FORMAT',
  });
}

describe('Verified operator QR formats', () => {
  it('recognizes the verified Kakao family with reordered parameters and printable uppercase IDs', () => {
    for (const rawQr of [kakaoQr, 'https://t.kakao.com/launch?id=AB1234&type=bike&ref=qrcode']) {
      assert.deepEqual(new QRParsingService().parse(rawQr), {
        rawQr, operatorId: 'kakao-bike', operatorName: '카카오 T 바이크', deviceId: 'AB1234',
        parserId: 'kakao-bike-launch-v1', matched: true, source: 'registered-parser', reason: null,
      });
    }
  });

  it('recognizes the exact verified Beam URL shape, equivalent root slash and leading zeroes', () => {
    for (const deviceId of ['7654321', '0123456', 'BC938', 'AB012']) {
      for (const rootPath of ['', '/']) {
        const rawQr = `https://deeplink.ridebeam.com${rootPath}?code=${deviceId}`;
        assert.deepEqual(new QRParsingService().parse(rawQr), {
          rawQr, operatorId: 'beam', operatorName: '빔', deviceId,
          parserId: 'beam-deeplink-v1', matched: true, source: 'registered-parser', reason: null,
        });
      }
    }
  });

  it('recognizes the verified GCOO operator without treating the token or its suffix as a device number', () => {
    assert.deepEqual(new QRParsingService().parse(gcooQr), {
      rawQr: gcooQr, operatorId: 'gcoo', operatorName: '지쿠', deviceId: null,
      parserId: 'gcoo-open-v1', matched: true, source: 'registered-parser', reason: null,
    });
  });

  it('extracts the printed GCOO number only from the verified 08201 prefix family', () => {
    for (const deviceId of ['654321', '012345']) {
      const rawQr = `https://open.gbike.io/?b=08201${deviceId}`;
      assert.deepEqual(new QRParsingService().parse(rawQr), {
        rawQr, operatorId: 'gcoo', operatorName: '지쿠', deviceId,
        parserId: 'gcoo-open-v1', matched: true, source: 'registered-parser', reason: null,
      });
    }
    for (const token of ['08200654321', '08202654321', '18201654321', '082010123456', '08201abcdef']) {
      assertUnknown(`https://open.gbike.io/?b=${token}`);
    }
  });

  it('extracts a bare five-digit Beam number only with an explicit Beam selection', () => {
    const service = new QRParsingService();
    for (const rawQr of ['54321', '01234']) {
      assert.deepEqual(service.parse(rawQr, 'beam'), {
        rawQr, operatorId: 'beam', operatorName: '빔', deviceId: rawQr,
        parserId: 'beam-numeric-selected-v1', matched: true, source: 'operator-selection', reason: null,
      });
      for (const selectedOperatorId of [undefined, 'gcoo', 'kakao-bike', 'elecle', 'alpaca', 'swing', '빔', 'BEAM']) {
        assertUnknown(rawQr, selectedOperatorId);
      }
    }
    for (const rawQr of ['5432', '543210', '5432100', 'AB123', '５４３２１', ' 54321', '54321 ', '54321\n', '54321\r', '54321\t', '54\0' + '321', '%3554321', 'https://example.test/?code=54321']) {
      assertUnknown(rawQr, 'beam');
    }
  });

  it('uses registered URL evidence before the selected operator context', () => {
    const service = new QRParsingService();
    assert.deepEqual(service.parse(kakaoQr, 'beam'), service.parse(kakaoQr));
    assert.deepEqual(service.parse(gcooPrintedNumberQr, 'beam'), service.parse(gcooPrintedNumberQr));
    assert.deepEqual(service.parse(beamQr, 'gcoo'), service.parse(beamQr));
  });

  it('does not normalize credentials, ports, lookalike hosts, paths or control characters into a match', () => {
    for (const valid of [kakaoQr, beamQr, beamQr.replace('7654321', 'AB123'), gcooQr, gcooPrintedNumberQr]) {
      const parsed = new URL(valid);
      for (const rawQr of [
        valid.replace('https:', 'http:'),
        valid.replace('https://', 'https://user:pass@'),
        valid.replace(parsed.hostname, `${parsed.hostname}:443`),
        valid.replace(parsed.hostname, `${parsed.hostname}.evil.test`),
        valid.replace(parsed.hostname, `${parsed.hostname}@evil.test`),
        valid.replace(parsed.hostname, `${parsed.hostname}.`),
        valid.replace(parsed.hostname, parsed.hostname.toUpperCase()),
        valid.replace(parsed.hostname, parsed.hostname.replace('.', '%2e')),
        valid.replace(parsed.hostname, `evil.test/${parsed.hostname}`),
        valid.replace(parsed.hostname, `${parsed.hostname}/other/..`),
        valid.replace(parsed.hostname, `${parsed.hostname}\\`),
        ` ${valid}`, `${valid} `, `${valid}\n`, `${valid}\r`, `${valid}\t`,
        valid.replace('https:', 'htt\tps:'), `${valid}\0`, `${valid}#fragment`,
        `${valid}&redirect=https://evil.test`,
      ]) assertUnknown(rawQr);
    }
  });

  it('rejects other Kakao products, duplicate or unverified parameters and unverified device formats', () => {
    for (const rawQr of [
      kakaoQr.replace('type=bike', 'type=taxi'),
      kakaoQr.replace('ref=qrcode', 'ref=nfc'),
      kakaoQr.replace('ref=qrcode&', ''),
      `${kakaoQr}&id=cd5678`,
      `${kakaoQr}&id=ab1234`,
      `${kakaoQr}&ref=qrcode`,
      `${kakaoQr}&extra=1`,
      `${kakaoQr}&`,
      kakaoQr.replace('&ref=', '&&ref='),
      kakaoQr.replace('id=ab1234', 'ID=ab1234'),
      kakaoQr.replace('id=ab1234', '%69d=ab1234'),
      kakaoQr.replace('id=ab1234', 'id=%61b1234'),
      kakaoQr.replace('id=ab1234', 'id=ab1234%0a'),
      ...['a1234', 'abc1234', 'ab123', 'ab12345', 'ab-1234', '12abcd', '', 'ab１２３４']
        .map(deviceId => kakaoQr.replace('ab1234', deviceId)),
    ]) assertUnknown(rawQr);
  });

  it('rejects Beam app-install links, duplicate or unknown parameters and unverified device formats', () => {
    for (const rawQr of [
      'https://www.ridebeam.com/',
      'https://deeplink.ridebeam.com/',
      beamQr.replace('?code=', '//?code='),
      beamQr.replace('code=', 'id='),
      beamQr.replace('code=', 'Code='),
      beamQr.replace('code=', '%63ode='),
      `${beamQr}&code=1234567`,
      `${beamQr}&code=7654321`,
      `${beamQr}&extra=1`,
      `${beamQr}&`,
      ...['765432', '76543210', 'a654321', '%37654321', '7654321%0a', '', '７６５４３２１',
        'ab123', 'Ab123', 'AB 123', 'AB12', 'AB1234', 'ABC12', 'A1234', 'AB１２３', 'AB123%0a']
        .map(deviceId => beamQr.replace('7654321', deviceId)),
    ]) assertUnknown(rawQr);
  });

  it('rejects unverified GCOO formats and bare numeric QR payloads without operator evidence', () => {
    for (const rawQr of [
      'https://open.gbike.io/',
      'https://www.gbike.io/?b=1234567890',
      gcooQr.replace('/?b=', '?b='),
      gcooQr.replace('b=', 'B='),
      gcooQr.replace('b=', 'id='),
      gcooQr.replace('b=', '%62='),
      `${gcooQr}&b=1234567890`,
      `${gcooQr}&extra=1`,
      `${gcooQr}&`,
      ...['123456789', '12345678901', 'abcdefghij', '%31234567890', '', '１２３４５６７８９０']
        .map(token => gcooQr.replace('1234567890', token)),
      '28139', '7654321', '1234567890',
    ]) assertUnknown(rawQr);
  });

  it('requires explicit registration and never fetches any scanned URL', context => {
    const fetch = context.mock.method(globalThis, 'fetch', () => { throw new Error('QR must not be fetched'); });
    const service = new QRParsingService();
    for (const rawQr of [kakaoQr, beamQr, gcooQr, gcooPrintedNumberQr, '54321', 'http://169.254.169.254/latest/meta-data/']) service.parse(rawQr, 'beam');
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(service.parse(beamQr).rawQr, beamQr);
    assert.equal(service.parse(beamQr).matched, true);
    const empty = new QRParsingService(new OperatorMatcher());
    assert.equal(empty.parse(kakaoQr).matched, false);
    assert.equal(empty.parse(beamQr).matched, false);
    assert.equal(empty.parse(gcooQr).matched, false);
    assert.equal(new KakaoBikeQRParser().canParse(beamQr), false);
    assert.equal(new BeamQRParser().canParse(kakaoQr), false);
    assert.equal(new GcooQRParser().canParse(beamQr), false);
  });
});
