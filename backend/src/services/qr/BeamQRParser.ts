import { BaseQRParser, type QRIdentifiers } from './BaseQRParser.js';
import { getOperator } from '../../catalog/operators.js';

const operator = getOperator('beam');

/**
 * A public Beam scooter photo was decoded and its printed number compared on
 * 2026-10-16. The seven-digit deeplink code family and a user-supplied Korean
 * two-letter/three-digit code were decoded and matched their printed numbers.
 * The decoded sample omitted the root slash; its equivalent explicit root path
 * is also accepted. Other paths and query shapes remain unverified.
 * Source: https://www.valerieseow.com/beam-scooter-kl/ (Malaysia, 2021).
 * Bare five-digit QR payloads require an explicit user selection of Beam and are
 * handled separately by QRParsingService; they do not identify an operator.
 */
export class BeamQRParser extends BaseQRParser {
  readonly id = 'beam-deeplink-v1';

  canParse(rawQr: string): boolean {
    return this.parseIdentifiers(rawQr) !== null;
  }

  protected parseIdentifiers(rawQr: string): QRIdentifiers | null {
    // Compare the entire literal so normalization cannot admit another authority,
    // escaped identifiers, extra parameters, fragments or a trailing newline.
    const match = rawQr.match(/^https:\/\/deeplink\.ridebeam\.com\/?\?code=([0-9]{7}|[A-Z]{2}[0-9]{3})$/);
    if (!match || match[0] !== rawQr) return null;
    return { operatorId: operator.id, operatorName: operator.name, deviceId: match[1]! };
  }
}
