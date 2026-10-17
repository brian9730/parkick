import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { ApiError } from '../../middleware/errors.js';
import type { EvidenceStorage, PreparedEvidence, SavedEvidence, StoredEvidence } from './EvidenceStorage.js';
import { prepareEvidence } from './prepareEvidence.js';

export type { EvidenceUpload, PreparedEvidence, SavedEvidence, StoredEvidence } from './EvidenceStorage.js';
export { MAX_PHOTO_BYTES } from './prepareEvidence.js';

/** Private local storage, readable only after the owning report is authorized. */
export class LocalEvidenceStorage implements EvidenceStorage {
  private readonly root: string;

  constructor(directory: string) { this.root = resolve(directory); }

  readonly prepare = prepareEvidence;

  async read(objectKey: string): Promise<{ buffer: Buffer }> {
    const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
    if (!new RegExp(`^${uuid}/${uuid}\\.jpg$`).test(objectKey)) {
      throw new ApiError(404, 'IMAGE_NOT_FOUND', '사진을 찾을 수 없습니다.');
    }
    try {
      const [directory] = objectKey.split('/');
      const target = resolve(this.root, objectKey);
      const [rootStat, directoryStat, targetStat] = await Promise.all([lstat(this.root), lstat(resolve(this.root, directory!)), lstat(target)]);
      if (rootStat.isSymbolicLink() || directoryStat.isSymbolicLink() || targetStat.isSymbolicLink()
        || !rootStat.isDirectory() || !directoryStat.isDirectory() || !targetStat.isFile()) throw new Error('Invalid evidence path');
      const [actualRoot, actualTarget] = await Promise.all([realpath(this.root), realpath(target)]);
      const child = relative(actualRoot, actualTarget);
      if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid evidence path');
      // Linux O_NOFOLLOW prevents a final-component symlink swap; inode checking also binds the opened file to the checked file.
      const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.dev !== targetStat.dev || stat.ino !== targetStat.ino || stat.size < 4 || stat.size > 32 * 1024 * 1024) throw new Error('Invalid evidence file');
        const buffer = await handle.readFile();
        if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) throw new Error('Invalid evidence image');
        return { buffer };
      } finally { await handle.close(); }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') throw new ApiError(404, 'IMAGE_NOT_FOUND', '사진을 찾을 수 없습니다.');
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', '사진을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  async save(prepared: readonly PreparedEvidence[]): Promise<SavedEvidence> {
    const directory = randomUUID();
    const target = this.ownedDirectory(directory);
    let created = false;
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      await mkdir(target, { mode: 0o700 });
      created = true;
      const images: StoredEvidence[] = [];
      for (const photo of prepared) {
        const name = `${randomUUID()}.jpg`;
        await writeFile(resolve(target, name), photo.buffer, { flag: 'wx', mode: 0o600 });
        images.push({ objectKey: `${directory}/${name}`, mimeType: 'image/jpeg', sizeBytes: photo.buffer.length, sha256: photo.sha256, exifRemoved: true });
      }
      return { directory, images };
    } catch {
      if (created) await this.remove(directory);
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', '사진을 보관하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  async remove(directory: string): Promise<void> {
    const target = this.ownedDirectory(directory);
    try {
      // Resolve before recursive removal; refuse symlinks/reparse points escaping this root.
      if ((await lstat(target)).isSymbolicLink()) throw new Error('Invalid evidence directory');
      const [actualRoot, actualTarget] = await Promise.all([realpath(this.root), realpath(target)]);
      const child = relative(actualRoot, actualTarget);
      if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid evidence directory');
      await rm(actualTarget, { recursive: true, force: true });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
      // Do not log filenames, phone numbers, uploaded data or raw filesystem errors.
      console.error(JSON.stringify({ event: 'evidence_cleanup_failed' }));
    }
  }

  private ownedDirectory(directory: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(directory)) throw new Error('Invalid evidence directory');
    const target = resolve(this.root, directory);
    const child = relative(this.root, target);
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid evidence directory');
    return target;
  }
}
