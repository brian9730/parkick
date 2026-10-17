export interface ParsedQR {
  /** Null means unknown. The UI must allow manual operator/device entry. */
  operatorId: string | null;
  /** Human-readable operator name. Keep the stable parser identifier out of report text. */
  operatorName: string | null;
  deviceId: string | null;
  rawQr: string;
  parserId: string;
  matched: boolean;
  /** operator-selection uses the user's chosen company; the QR alone does not identify it. */
  source: 'registered-parser' | 'operator-selection' | 'unknown';
  reason: 'UNVERIFIED_QR_FORMAT' | null;
}

/** Register operator-specific parsers only after verifying actual QR samples and their format. */
export interface QRParser {
  readonly id: string;
  canParse(rawQr: string): boolean;
  parse(rawQr: string): ParsedQR;
}
