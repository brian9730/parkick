import { BaseQRParser, type QRIdentifiers } from './BaseQRParser.js';
import { getOperator } from '../../catalog/operators.js';

const operator = getOperator('elecle');

/** Verified against the user's Elecle vehicle photo; sn matches the label. */
export class ElecleQRParser extends BaseQRParser {
  readonly id = 'elecle-matrix-v1';

  canParse(rawQr: string): boolean { return this.parseIdentifiers(rawQr) !== null; }

  protected parseIdentifiers(rawQr: string): QRIdentifiers | null {
    const match = rawQr.match(/^https:\/\/matrix\.elecle\.bike\/scan\/qr\?sn=([0-9]{8})$/);
    if (!match || match[0] !== rawQr) return null;
    return { operatorId: operator.id, operatorName: operator.name, deviceId: match[1]! };
  }
}
