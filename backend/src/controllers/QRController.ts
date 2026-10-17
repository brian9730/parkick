import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { QRParsingService } from '../services/qr/QRParsingService.js';
import { OPERATORS } from '../catalog/operators.js';

const parseSchema = z.strictObject({
  rawQr: z.string().min(1).max(4096)
    .refine((value) => value.trim().length > 0 && !value.includes('\0')),
  selectedOperatorId: z.string().refine(value => OPERATORS.some(operator => operator.id === value)).optional(),
});

export class QRController {
  constructor(private readonly service: QRParsingService) {}

  parse: RequestHandler = (request, response) => {
    const { rawQr, selectedOperatorId } = parseSchema.parse(request.body);
    response.json({ data: this.service.parse(rawQr, selectedOperatorId) });
  };
}
