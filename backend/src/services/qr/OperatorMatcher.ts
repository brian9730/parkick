import type { QRParser } from './QRParser.js';

/** Callers explicitly register only rules supported by verified operator QR samples. */
export class OperatorMatcher {
  private readonly parsers = new Map<string, QRParser>();

  constructor(parsers: readonly QRParser[] = []) {
    for (const parser of parsers) this.register(parser);
  }

  register(parser: QRParser): void {
    if (!parser.id.trim() || parser.id === 'generic-unknown' || this.parsers.has(parser.id)) {
      throw new Error('QR parser IDs must be unique and must not use the generic fallback ID.');
    }
    this.parsers.set(parser.id, parser);
  }

  match(rawQr: string): QRParser | null {
    const matches = [...this.parsers.values()].filter((parser) => parser.canParse(rawQr));
    // Ambiguous rules must not silently assign another operator's identifier.
    return matches.length === 1 ? matches[0]! : null;
  }
}
