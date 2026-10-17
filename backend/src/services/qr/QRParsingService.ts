import { GenericQRParser } from './GenericQRParser.js';
import { BeamQRParser } from './BeamQRParser.js';
import { GcooQRParser } from './GcooQRParser.js';
import { KakaoBikeQRParser } from './KakaoBikeQRParser.js';
import { OperatorMatcher } from './OperatorMatcher.js';
import { getOperator } from '../../catalog/operators.js';
import type { ParsedQR } from './QRParser.js';

export class QRParsingService {
  private readonly fallback = new GenericQRParser();

  constructor(private readonly matcher = new OperatorMatcher([new KakaoBikeQRParser(), new BeamQRParser(), new GcooQRParser()])) {}

  parse(rawQr: string, selectedOperatorId?: string): ParsedQR {
    try {
      const result = this.matcher.match(rawQr)?.parse(rawQr);
      if (result?.matched && result.operatorId?.trim() && result.operatorName?.trim()) {
        // Preserve the exact scan even if a provider parser normalizes input internally.
        return { ...result, rawQr };
      }
    } catch {
      // A broken parser must retain manual entry. Never log QR contents or parser errors.
    }
    // A user-supplied Korean Beam photo matched a bare five-digit QR to its
    // printed number. Such digits are not globally unique operator evidence.
    // Only an explicit company selection permits this contextual extraction.
    const numeric = rawQr.match(/^[0-9]{5}$/);
    if (selectedOperatorId === 'beam' && numeric?.[0] === rawQr) {
      const operator = getOperator('beam');
      return {
        rawQr, operatorId: operator.id, operatorName: operator.name, deviceId: rawQr,
        parserId: 'beam-numeric-selected-v1', matched: true, source: 'operator-selection', reason: null,
      };
    }
    return this.fallback.parse(rawQr);
  }
}
