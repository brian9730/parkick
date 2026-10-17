import { execFile, spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from 'dotenv';
import { assertDevelopmentOnly, backendDirectory, localDataDirectory, localDatabasePort, localDatabaseUser } from './local-database.js';

const markerPath = resolve(backendDirectory, 'data', '.parkick-postgres.json');
const expectedMarker = { purpose: 'parkick-local-development', port: localDatabasePort, user: localDatabaseUser, database: 'parkick' };
const executableSuffix = process.platform === 'win32' ? '.exe' : '';

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function runTool(binary: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    // Empty PGSERVICE still asks libpq to resolve a service on Windows; remove inherited options.
    const environment: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(environment)) if (key.startsWith('PG')) delete environment[key];
    Object.assign(environment, {
      PGHOST: '127.0.0.1', PGPORT: String(localDatabasePort), PGUSER: localDatabaseUser,
      PGDATABASE: 'postgres', PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable', PGCLIENTENCODING: 'UTF8',
      PGPASSFILE: resolve(backendDirectory, 'data', '.unused-pg-pass'),
    });
    const child = execFile(binary, args, {
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      env: environment,
    }, (error, stdout) => {
      if (error) {
        // Never print inherited environment values or full command lines.
        reject(new Error(`${basename(binary)} 실행에 실패했습니다. 로컬 PostgreSQL 로그와 포트 사용 여부를 확인해주세요.`));
      } else resolveOutput(stdout.trim());
    });
    child.stdin?.end(input);
  });
}

/** A Windows PostgreSQL child may inherit pipes after pg_ctl exits. No pipes are needed for start. */
function startCluster(binary: string, args: string[]): Promise<void> {
  return new Promise((resolveStarted, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('PostgreSQL 시작 대기 시간이 초과되었습니다. 로컬 DB 로그를 확인해주세요.'));
    }, 45_000);
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('PostgreSQL 시작 명령을 실행하지 못했습니다.'));
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveStarted();
      else reject(new Error('PostgreSQL을 시작하지 못했습니다. 로컬 DB 로그를 확인해주세요.'));
    });
  });
}

async function locateBinaries(): Promise<string> {
  const candidates: string[] = [];
  if (process.env.PARKICK_PG_BIN) candidates.push(resolve(process.env.PARKICK_PG_BIN));
  if (process.platform === 'win32') {
    const parent = resolve(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL');
    const versions = await readdir(parent).catch(() => [] as string[]);
    candidates.push(...versions.sort((a, b) => Number(b) - Number(a)).map((version) => resolve(parent, version, 'bin')));
  } else {
    candidates.push('/usr/local/opt/postgresql@18/bin', '/opt/homebrew/opt/postgresql@18/bin', '/usr/lib/postgresql/18/bin', '/usr/lib/postgresql/17/bin', '/usr/bin');
  }
  for (const directory of candidates) {
    if (await exists(resolve(directory, `initdb${executableSuffix}`))
      && await exists(resolve(directory, `pg_ctl${executableSuffix}`))
      && await exists(resolve(directory, `psql${executableSuffix}`))) return directory;
  }
  throw new Error('PostgreSQL 실행 파일이 없습니다. 설치한 bin 폴더를 PARKICK_PG_BIN 환경변수로 지정해주세요.');
}

async function assertManagedDirectory(): Promise<void> {
  const workspace = await realpath(backendDirectory);
  const candidate = resolve(localDataDirectory);
  const relativePath = relative(workspace, candidate);
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('로컬 DB 경로가 프로젝트 밖에 있습니다.');
  // Resolve existing parents to reject junctions/symlinks that could redirect lifecycle commands.
  for (const path of [dirname(candidate), candidate]) {
    if (!await exists(path)) continue;
    const actual = await realpath(path);
    const withinWorkspace = relative(workspace, actual);
    if (!withinWorkspace || withinWorkspace.startsWith('..') || isAbsolute(withinWorkspace)) throw new Error('로컬 DB 경로의 링크가 프로젝트 밖을 가리킵니다.');
  }
}

async function hasOwnershipMarker(): Promise<boolean> {
  if (!await exists(markerPath)) return false;
  const marker: unknown = JSON.parse(await readFile(markerPath, 'utf8'));
  if (JSON.stringify(marker) !== JSON.stringify(expectedMarker)) throw new Error('이 데이터 폴더는 현재 Parkick 로컬 DB 설정으로 관리할 수 없습니다.');
  return true;
}

async function ensurePortAvailable(): Promise<void> {
  await new Promise<void>((resolveAvailable, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`로컬 DB 포트 ${localDatabasePort}를 다른 프로세스가 사용하고 있습니다. 기존 서비스는 변경하지 않습니다.`)));
    server.listen(localDatabasePort, '127.0.0.1', () => server.close((error) => error ? reject(error) : resolveAvailable()));
  });
}

async function query(binaryDirectory: string, sql: string, database?: string): Promise<string> {
  const args = ['-X', '-w', '-h', '127.0.0.1', '-p', String(localDatabasePort), '-U', localDatabaseUser, '-d', 'postgres', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
  if (database) args.push('-v', `database=${database}`);
  args.push('-f', '-');
  return runTool(resolve(binaryDirectory, `psql${executableSuffix}`), args, sql);
}

export async function manageLocalPostgres(action: string): Promise<void> {
  assertDevelopmentOnly();
  if (!['start', 'stop'].includes(action)) throw new Error('명령은 start 또는 stop이어야 합니다.');
  await assertManagedDirectory();
  const binaries = await locateBinaries();
  const pgCtl = resolve(binaries, `pg_ctl${executableSuffix}`);
  const initialized = await exists(resolve(localDataDirectory, 'PG_VERSION'));
  const managed = await hasOwnershipMarker();
  if (initialized && !managed) throw new Error('기존 PostgreSQL 데이터 폴더의 관리 표식이 없어 작업을 중단했습니다. 기존 데이터는 변경하지 않습니다.');
  if (action === 'stop') {
    if (!initialized) { console.info('Parkick 로컬 DB가 아직 초기화되지 않았습니다.'); return; }
    try { await runTool(pgCtl, ['-D', localDataDirectory, 'status']); }
    catch { console.info('Parkick 로컬 DB가 이미 중지되어 있습니다.'); return; }
    await runTool(pgCtl, ['-D', localDataDirectory, '-w', '-t', '30', '-m', 'fast', 'stop']);
    console.info('Parkick 로컬 DB를 중지했습니다. 데이터는 보존됩니다.');
    return;
  }
  if (!initialized) {
    await ensurePortAvailable();
    await mkdir(dirname(localDataDirectory), { recursive: true });
    await runTool(resolve(binaries, `initdb${executableSuffix}`), ['-D', localDataDirectory, '-U', localDatabaseUser, '-A', 'trust', '--encoding=UTF8', '--locale=C']);
    await writeFile(markerPath, JSON.stringify(expectedMarker), { encoding: 'utf8', flag: 'wx' });
  }
  let running = true;
  try { await runTool(pgCtl, ['-D', localDataDirectory, 'status']); } catch { running = false; }
  if (!running) {
    await ensurePortAvailable();
    await startCluster(pgCtl, ['-D', localDataDirectory, '-l', resolve(backendDirectory, 'data', 'postgres.log'), '-w', '-t', '30', '-o', `-h 127.0.0.1 -p ${localDatabasePort}`, 'start']);
  }
  const connectedDirectory = await query(binaries, "SELECT current_setting('data_directory');\n");
  if ((await realpath(connectedDirectory)).toLowerCase() !== (await realpath(localDataDirectory)).toLowerCase()) {
    throw new Error('연결된 PostgreSQL이 Parkick 전용 데이터 폴더와 일치하지 않아 작업을 중단했습니다.');
  }
  for (const database of ['parkick', 'parkick_test']) {
    const present = await query(binaries, "SELECT 1 FROM pg_database WHERE datname = :'database';\n", database);
    if (present !== '1') await query(binaries, 'CREATE DATABASE :"database" OWNER "parkick_local" ENCODING \'UTF8\';\n', database);
  }
  console.info(`Parkick 로컬 PostgreSQL 준비 완료: 127.0.0.1:${localDatabasePort} (parkick / parkick_test).`);
  console.info('프로젝트 전용 개발 DB입니다. localhost trust 인증을 사용하며 기존 PostgreSQL 서비스는 변경하지 않습니다.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(resolve(process.argv[1])))) {
  config({ path: resolve(backendDirectory, '.env'), quiet: true });
  manageLocalPostgres(process.argv[2] ?? 'start').catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Parkick 로컬 PostgreSQL 작업에 실패했습니다.');
    process.exitCode = 1;
  });
}
