import type { ParsedQR, QRParser } from './QRParser.js';

export interface QRIdentifiers {
  operatorId: string;
  operatorName: string;
  deviceId: string | null;
}

/** Parsers inspect text locally. They must never fetch or execute the scanned payload. */
export abstract class BaseQRParser implements QRParser {
  abstract readonly id: string;
  abstract canParse(rawQr: string): boolean;
  protected abstract parseIdentifiers(rawQr: string): QRIdentifiers | null;

  parse(rawQr: string): ParsedQR {
    const identifiers = this.canParse(rawQr) ? this.parseIdentifiers(rawQr) : null;
    if (!identifiers || !identifiers.operatorId.trim() || !identifiers.operatorName.trim()) {
      return {
        rawQr, operatorId: null, operatorName: null, deviceId: null, parserId: this.id,
        matched: false, source: 'unknown', reason: 'UNVERIFIED_QR_FORMAT',
      };
    }
    return {
      rawQr, operatorId: identifiers.operatorId, operatorName: identifiers.operatorName, deviceId: identifiers.deviceId,
      parserId: this.id, matched: true, source: 'registered-parser', reason: null,
    };
  }
}
