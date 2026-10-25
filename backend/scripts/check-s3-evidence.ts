import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { S3EvidenceStorage } from '../src/services/storage/S3EvidenceStorage.js';

/** Exercises the same S3 save and signed-read path as the production API without creating a report. */
async function main(): Promise<void> {
  const region = process.env.AWS_REGION?.trim();
  const bucket = process.env.S3_REPORT_BUCKET?.trim();
  const prefix = process.env.S3_REPORT_PREFIX?.trim() || 'reports';
  if (process.env.REPORT_STORAGE_PROVIDER !== 's3' || !region || !bucket) {
    throw new Error('S3 storage environment is not configured');
  }
  const storage = new S3EvidenceStorage({ region, bucket, prefix });
  let directory: string | undefined;
  try {
    const source = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#55aa77' } }).jpeg().toBuffer();
    const prepared = await storage.prepare([{ originalname: 'storage-check.jpg', mimetype: 'image/jpeg', buffer: source }]);
    const saved = await storage.save(prepared);
    directory = saved.directory;
    const evidence = saved.images[0];
    if (!evidence) throw new Error('No evidence was saved');
    const read = await storage.read(evidence.objectKey);
    if (!('redirect' in read)) throw new Error('S3 read did not return a signed URL');
    const response = await fetch(read.redirect, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Signed evidence read failed');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== evidence.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== evidence.sha256) {
      throw new Error('Signed evidence content mismatch');
    }
    await storage.remove(directory);
    directory = undefined;
    const afterDelete = await fetch(read.redirect, { signal: AbortSignal.timeout(15_000) });
    if (afterDelete.ok) throw new Error('Temporary S3 evidence was not deleted');
    console.info('S3 evidence path verified: upload, signed read, SHA-256, delete');
  } finally {
    if (directory) await storage.remove(directory);
    storage.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('S3 evidence path check failed');
    process.exitCode = 1;
  });
}
