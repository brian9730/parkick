#!/usr/bin/env bash
# sudo bash deploy/configure-demo.sh https://your-domain
# Creates only the first deployment's dedicated DB/env. No migrations, service start,
# public HTTP, AWS calls, or source installation. New deployments keep photos on EC2.
# Existing secrets and storage selection are preserved; review the env explicitly to change them.
set -Eeuo pipefail
umask 077
if [[ ${EUID} -ne 0 || $# -ne 1 ]]; then
  echo 'Usage: sudo bash configure-demo.sh HTTPS_ORIGIN' >&2
  exit 1
fi
if [[ ! -f /etc/parkick/bootstrap-managed ]] || ! id parkick >/dev/null 2>&1; then
  echo 'Run bootstrap-host.sh on the new Parkick host first.' >&2
  exit 1
fi

node --input-type=module - "$@" <<'NODE'
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { parseEnv } from 'node:util';

const [originText] = process.argv.slice(2);
const envPath = '/etc/parkick/backend.env';
const pendingPath = '/etc/parkick/backend.env.pending';
const storagePath = '/var/lib/parkick/reports';
const fail = (message) => { throw new Error(message); };
function sql(statement, database = 'postgres') {
  try {
    return execFileSync('/usr/sbin/runuser', ['-u', 'postgres', '--', 'psql', '-X', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', database], {
      input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    }).trim();
  } catch {
    // Never print psql stderr or the SQL text: a role creation contains a password.
    fail('PostgreSQL setup failed. Review the dedicated DB locally; credentials were not printed.');
  }
}
try {
  let origin;
  try { origin = new URL(originText); } catch { fail('An HTTPS origin is required.'); }
  if (origin.protocol !== 'https:' || origin.origin !== originText || origin.username || origin.password) fail('Use an HTTPS origin without a path or credentials.');
  if (sql('SHOW listen_addresses;') !== 'localhost') fail('PostgreSQL must listen only on localhost.');
  if (sql("SELECT count(*) FROM pg_hba_file_rules WHERE type LIKE 'host%' AND database && ARRAY['all','parkick'] AND user_name && ARRAY['all','parkick_app'] AND auth_method = 'trust';") !== '0') {
    fail('PostgreSQL TCP trust authentication is not permitted for this deployment.');
  }
  const roleExists = sql("SELECT count(*) FROM pg_roles WHERE rolname = 'parkick_app';") === '1';
  const databaseOwner = sql("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'parkick';");
  if (databaseOwner && databaseOwner !== 'parkick_app') fail('An unrelated parkick database already exists.');
  let values;
  if (existsSync(envPath)) {
    if (!lstatSync(envPath).isFile() || lstatSync(envPath).isSymbolicLink()) fail('Environment path must be a regular file.');
    values = parseEnv(readFileSync(envPath, 'utf8'));
    if (values.FRONTEND_ORIGIN !== originText) {
      fail('The saved origin differs. Review /etc/parkick/backend.env; existing values were preserved.');
    }
  } else {
    if (roleExists || databaseOwner) fail('Existing application DB/role without its environment file; refusing to replace credentials.');
    if (existsSync(pendingPath)) fail('An interrupted environment setup exists; review backend.env.pending before retrying.');
    values = {
      NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '4000', FRONTEND_ORIGIN: originText,
      TRUST_PROXY: 'loopback', ENABLE_DEV_ADMIN: 'false',
      DATABASE_URL: `postgresql://parkick_app:${randomBytes(32).toString('hex')}@127.0.0.1:5432/parkick`,
      PHONE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      PHONE_LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
      REPORT_STORAGE_PROVIDER: 'local', REPORT_STORAGE_DIR: storagePath, AWS_REGION: '', S3_REPORT_BUCKET: '',
      S3_REPORT_PREFIX: 'reports', REPORT_REGION_CODE: 'local-development', AI_PROVIDER: 'disabled', BEDROCK_REPORT_MODEL_ID: '',
    };
    const content = Object.entries(values).map(([key, value]) => `${key}="${value}"`).join('\n') + '\n';
    writeFileSync(pendingPath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    renameSync(pendingPath, envPath);
  }
  const requiredValues = { NODE_ENV: 'production', HOST: '127.0.0.1', ENABLE_DEV_ADMIN: 'false', TRUST_PROXY: 'loopback', REPORT_REGION_CODE: 'local-development' };
  for (const [key, expected] of Object.entries(requiredValues)) if (values[key] !== expected) fail(`Review ${key} in the saved environment.`);
  if (values.REPORT_STORAGE_PROVIDER === 'local') {
    if (values.REPORT_STORAGE_DIR !== storagePath) fail('Review REPORT_STORAGE_DIR; this setup uses /var/lib/parkick/reports.');
    for (const path of ['/var/lib/parkick', storagePath]) {
      if (existsSync(path) && (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())) {
        fail('Review the private photo directory; symbolic links and non-directories are not accepted.');
      }
    }
    execFileSync('/usr/bin/install', ['-d', '-o', 'parkick', '-g', 'parkick', '-m', '0700', '/var/lib/parkick', storagePath], { stdio: 'ignore' });
  } else if (values.REPORT_STORAGE_PROVIDER === 's3') {
    // Preserve an explicitly configured S3 deployment without silently moving existing photos.
    if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(values.AWS_REGION ?? '')
      || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(values.S3_REPORT_BUCKET ?? '')) fail('Review the saved S3 region and bucket.');
  } else fail('Review REPORT_STORAGE_PROVIDER in the saved environment.');
  const database = new URL(values.DATABASE_URL ?? '');
  if (database.protocol !== 'postgresql:' || database.hostname !== '127.0.0.1' || database.port !== '5432'
    || database.username !== 'parkick_app' || database.pathname !== '/parkick' || !database.password || database.search || database.hash) fail('Unexpected saved database target.');
  for (const key of ['PHONE_ENCRYPTION_KEY', 'PHONE_LOOKUP_HMAC_KEY']) {
    const decoded = Buffer.from(values[key] ?? '', 'base64');
    if (decoded.length !== 32 || decoded.toString('base64') !== values[key]) fail(`Review ${key}; existing keys were preserved.`);
  }
  if (values.PHONE_ENCRYPTION_KEY === values.PHONE_LOOKUP_HMAC_KEY) fail('Phone keys must be independent.');
  chmodSync(envPath, 0o640);
  execFileSync('/usr/bin/chown', ['root:parkick', envPath], { stdio: 'ignore' });
  if (!roleExists) {
    const password = decodeURIComponent(database.password).replaceAll("'", "''");
    sql(`SET log_statement = 'none'; SET log_min_error_statement = 'panic'; SET password_encryption = 'scram-sha-256'; CREATE ROLE parkick_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}';`);
  }
  if (sql("SELECT count(*) FROM pg_roles WHERE rolname = 'parkick_app' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication;") !== '1') fail('The application role must be an unprivileged login role.');
  if (!databaseOwner) sql("CREATE DATABASE parkick OWNER parkick_app ENCODING 'UTF8';");
  sql('REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE, CREATE ON SCHEMA public TO parkick_app;', 'parkick');
  try {
    execFileSync('/usr/bin/psql', ['-X', '-tA', '-h', '127.0.0.1', '-p', '5432', '-U', 'parkick_app', '-d', 'parkick', '-c', 'SELECT 1'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', PGPASSWORD: decodeURIComponent(database.password), PGCONNECT_TIMEOUT: '5' },
    });
  } catch { fail('Application DB password connection failed; existing credentials were preserved.'); }
  console.info('Dedicated PostgreSQL DB and /etc/parkick/backend.env are ready. Secrets were preserved and not printed.');
} catch (error) {
  // Only our deliberate, non-sensitive messages reach the terminal.
  const text = error instanceof Error ? error.message : '';
  const allowed = /^(Invalid region|An HTTPS|Use an HTTPS|PostgreSQL|An unrelated|Environment path|The saved|Existing application|An interrupted|Review |Unexpected saved|Phone keys|The application|Application DB)/;
  console.error(allowed.test(text) ? text : 'Deployment configuration failed. Inspect the server locally; no credentials were printed.');
  process.exitCode = 1;
}
NODE
