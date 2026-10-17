import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export default function setupSubmission() {
  const cwd = resolve('backend');
  const env = { ...process.env, DATABASE_URL: 'postgresql://parkick_local@127.0.0.1:55432/parkick_test' };
  // No reset or truncate: repeated test runs preserve existing rows and use unique IDs.
  execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd, env, stdio: 'inherit' });
  execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], { cwd, env, stdio: 'inherit' });
}
