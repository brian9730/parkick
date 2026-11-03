import { PrismaClient } from '../backend/src/generated/prisma/client.js';
import { provisionStaffAccounts } from './staff-accounts.js';

function assertTarget(): void {
  if (process.env.NODE_ENV !== 'production' || process.argv.length !== 2 || process.stdin.isTTY) {
    throw new Error('Invalid invocation.');
  }
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '5432'
    || url.pathname !== '/parkick' || url.username !== 'parkick_app' || !url.password || url.hash
    || [...url.searchParams.keys()].some(key => key !== 'schema')
    || url.searchParams.getAll('schema').length > 1
    || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error('Invalid database target.');
  }
}

async function readInput(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 8192) throw new Error('Input is too large.');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, ''));
}

// Deliberate operator action: credentials are accepted only through a pipe, never through argv or env.
let client: PrismaClient | undefined;
try {
  assertTarget();
  const input = await readInput();
  client = new PrismaClient({ log: [] });
  const result = await provisionStaffAccounts(client, input);
  console.info(JSON.stringify({ status: 'ok', ...result }));
} catch {
  // Do not expose credentials, database addresses, hashes, or ORM error details.
  console.error('Staff account provisioning failed. Check the database target, tenant, input, migration, and existing accounts.');
  process.exitCode = 1;
} finally {
  try { await client?.$disconnect(); }
  catch {
    console.error('Could not confirm database disconnection. Check account state before retrying.');
    process.exitCode = 1;
  }
}
