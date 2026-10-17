import { readFileSync } from 'node:fs';
import { z } from 'zod';

const operatorSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().trim().min(1).max(80),
  aliases: z.array(z.string().trim().min(1).max(80)),
});

export type Operator = Readonly<Omit<z.infer<typeof operatorSchema>, 'aliases'>> & { readonly aliases: readonly string[] };

// The same path is valid from src/catalog and dist/catalog. This catalog is
// bundled with the application; no scanned text or request selects a file.
export const OPERATORS: readonly Operator[] = Object.freeze(z.array(operatorSchema).min(1)
  .parse(JSON.parse(readFileSync(new URL('../../../shared/operators.json', import.meta.url), 'utf8')))
  .map(operator => Object.freeze({ ...operator, aliases: Object.freeze(operator.aliases) })));

const byId = new Map<string, Operator>();
const byAlias = new Map<string, Operator>();
const aliasKey = (value: string) => value.trim().toLowerCase();

for (const operator of OPERATORS) {
  if (byId.has(operator.id)) throw new Error('Operator catalog IDs must be unique.');
  byId.set(operator.id, operator);
  for (const alias of [operator.id, operator.name, ...operator.aliases]) {
    const key = aliasKey(alias);
    const existing = byAlias.get(key);
    if (existing && existing.id !== operator.id) throw new Error('Operator catalog aliases must identify one operator.');
    byAlias.set(key, operator);
  }
}

export function getOperator(id: string): Operator {
  const operator = byId.get(id);
  if (!operator) throw new Error('Unknown registered operator.');
  return operator;
}

export function findOperator(value: string): Operator | null {
  return byAlias.get(aliasKey(value)) ?? null;
}

/** Known aliases share one display/storage name; custom legacy names stay intact. */
export function normalizeOperatorName(value: string | null): string | null {
  return value === null ? null : findOperator(value)?.name ?? value;
}

/** Used only to expand an operator search; ownership and status filters are unchanged. */
export function matchingOperatorAliases(query: string): string[] {
  const key = aliasKey(query);
  if (!key) return [];
  return [...new Set(OPERATORS.filter(operator => [operator.id, operator.name, ...operator.aliases]
    .some(alias => aliasKey(alias).includes(key)))
    .flatMap(operator => [operator.id, operator.name, ...operator.aliases]))];
}
