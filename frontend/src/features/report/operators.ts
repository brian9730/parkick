import catalog from '../../../../shared/operators.json';

/** Shared with the QR parsers and server-side report validation. */
export const operators = catalog;

const key = (value: string) => value.trim().toLowerCase();

export function findOperator(value: string) {
  const normalized = key(value);
  return operators.find(operator => [operator.id, operator.name, ...operator.aliases].some(alias => key(alias) === normalized));
}

export function normalizeOperatorName(value: string): string {
  return findOperator(value)?.name ?? value.trim();
}
