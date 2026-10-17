import { BaseQRParser, type QRIdentifiers } from './BaseQRParser.js';
import { getOperator } from '../../catalog/operators.js';

const operator = getOperator('kakao-bike');

/**
 * Verified against a user-supplied Kakao T Bike QR photo on 2026-10-16.
 * The URL's two-letter/four-digit ID matched the bike's printed identifier.
 * Other Kakao URLs and unverified ID families intentionally remain manual.
 */
export class KakaoBikeQRParser extends BaseQRParser {
  readonly id = 'kakao-bike-launch-v1';

  canParse(rawQr: string): boolean {
    return this.parseIdentifiers(rawQr) !== null;
  }

  protected parseIdentifiers(rawQr: string): QRIdentifiers | null {
    // Validate the literal authority and path before URL parsing can normalize them.
    // Percent escapes, whitespace, fragments, credentials and ports are not verified.
    const literal = rawQr.match(/^https:\/\/t\.kakao\.com\/launch\?(?:[a-zA-Z0-9]+=[a-zA-Z0-9]+&){2}[a-zA-Z0-9]+=[a-zA-Z0-9]+$/);
    if (!literal || literal[0] !== rawQr) return null;

    const parameters = new URL(rawQr).searchParams;
    const keys = [...parameters.keys()];
    if (keys.length !== 3 || new Set(keys).size !== 3
      || !keys.every(key => ['type', 'ref', 'id'].includes(key))
      || parameters.get('type') !== 'bike' || parameters.get('ref') !== 'qrcode') return null;

    const deviceId = parameters.get('id');
    if (!deviceId || !/^[a-zA-Z]{2}[0-9]{4}$/.test(deviceId)) return null;
    return { operatorId: operator.id, operatorName: operator.name, deviceId: deviceId.toUpperCase() };
  }
}
