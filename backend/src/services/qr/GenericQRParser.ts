import { BaseQRParser } from './BaseQRParser.js';

/** URL-looking text is not evidence of a vendor or device identifier. */
export class GenericQRParser extends BaseQRParser {
  readonly id = 'generic-unknown';

  canParse(): boolean {
    return true;
  }

  protected parseIdentifiers(): null {
    return null;
  }
}
