import { BaseQRParser, type QRIdentifiers } from './BaseQRParser.js';
import { getOperator } from '../../catalog/operators.js';

const operator = getOperator('swing');

/** Verified against the user's Swing vehicle photo; the path ID matches its label. */
export class SwingQRParser extends BaseQRParser {
  readonly id = 'swing-qrcode-v1';

  canParse(rawQr: string): boolean { return this.parseIdentifiers(rawQr) !== null; }

  protected parseIdentifiers(rawQr: string): QRIdentifiers | null {
    const match = rawQr.match(/^http:\/\/qrcode\.theswing\.co\.kr\/swingapp\.page\.link\/([A-Z]{2}[0-9]{4})$/);
    if (!match || match[0] !== rawQr) return null;
    return { operatorId: operator.id, operatorName: operator.name, deviceId: match[1]! };
  }
}
