import { BaseQRParser, type QRIdentifiers } from './BaseQRParser.js';
import { getOperator } from '../../catalog/operators.js';

const operator = getOperator('gcoo');

/**
 * The user's Korean vehicle photo decoded on 2026-10-16 verifies the narrow
 * eleven-digit 08201 + six-digit printed-number family. Preserve leading zeros.
 * A legacy ten-digit token came from https://wooastory.tistory.com/136
 * (2020-04-30); its relation to the printed identifier is still unconfirmed,
 * so that family identifies only the operator. Other prefixes are unverified.
 */
export class GcooQRParser extends BaseQRParser {
  readonly id = 'gcoo-open-v1';

  canParse(rawQr: string): boolean {
    return this.parseIdentifiers(rawQr) !== null;
  }

  protected parseIdentifiers(rawQr: string): QRIdentifiers | null {
    const match = rawQr.match(/^https:\/\/open\.gbike\.io\/\?b=(?:08201([0-9]{6})|[0-9]{10})$/);
    if (!match || match[0] !== rawQr) return null;
    return { operatorId: operator.id, operatorName: operator.name, deviceId: match[1] ?? null };
  }
}
