import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// tsc emits the generated client but cannot copy Prisma's native query engine.
const source = resolve('src/generated/prisma');
const destination = resolve('dist/generated/prisma');
await mkdir(destination, { recursive: true });
for (const name of await readdir(source)) {
  if (/^(lib)?query_engine.*\.(node|dll|so|dylib)$/.test(name)) {
    await copyFile(resolve(source, name), resolve(destination, name));
  }
}
