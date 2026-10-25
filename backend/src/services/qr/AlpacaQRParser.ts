import { BaseQRParser, type QRIdentifiers } from './BaseQRParser.js';
import { getOperator } from '../../catalog/operators.js';

const operator = getOperator('alpaca');

/** Verified against the user's Alpaca vehicle photo; code matches the label. */
export class AlpacaQRParser extends BaseQRParser {
  readonly id = 'alpaca-qc-v1';

  canParse(rawQr: string): boolean { return this.parseIdentifiers(rawQr) !== null; }

  protected parseIdentifiers(rawQr: string): QRIdentifiers | null {
    const match = rawQr.match(/^http:\/\/go-sbike\.com\/qc\/index\.do\?code=([0-9]{6})$/);
    if (!match || match[0] !== rawQr) return null;
    return { operatorId: operator.id, operatorName: operator.name, deviceId: match[1]! };
  }
}
