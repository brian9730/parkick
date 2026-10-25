import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import sharp from 'sharp';
import { ApiError } from '../../middleware/errors.js';
import type { EvidenceUpload, PreparedEvidence } from './EvidenceStorage.js';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 2;
const MAX_PIXELS = 40_000_000;

function badPhoto(): ApiError { return new ApiError(400, 'INVALID_PHOTO', '사진 형식이나 내용을 확인해주세요. JPG·PNG·WebP 정지 사진만 첨부할 수 있습니다.'); }

function detectFormat(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function animated(buffer: Buffer, format: 'jpeg' | 'png' | 'webp'): boolean {
  if (format === 'jpeg') return false;
  let offset = format === 'png' ? 8 : 12;
  while (offset + 8 <= buffer.length) {
    const length = format === 'png' ? buffer.readUInt32BE(offset) : buffer.readUInt32LE(offset + 4);
    const name = buffer.toString('ascii', offset + (format === 'png' ? 4 : 0), offset + (format === 'png' ? 8 : 4));
    if (name === 'acTL' || name === 'ANIM' || name === 'ANMF') return true;
    if (name === 'VP8X' && buffer[offset + 8] !== undefined && (buffer[offset + 8]! & 2)) return true;
    offset += format === 'png' ? length + 12 : length + 8 + (length % 2);
  }
  return false;
}

/** Both local and S3 persistence receive the same decoded, metadata-free JPEG evidence. */
export async function prepareEvidence(files: readonly EvidenceUpload[]): Promise<PreparedEvidence[]> {
  if (files.length < 1 || files.length > MAX_PHOTOS) throw new ApiError(400, 'INVALID_PHOTOS', '현장 사진을 1~2장 첨부해주세요.');
  const prepared: PreparedEvidence[] = [];
  for (const file of files) {
    if (!file.buffer.length) throw badPhoto();
    if (file.buffer.length > MAX_PHOTO_BYTES) throw new ApiError(413, 'PHOTO_TOO_LARGE', '사진은 한 장당 10MB 이하로 첨부해주세요.');
    const format = detectFormat(file.buffer);
    const extension = extname(file.originalname).toLowerCase();
    if (!format || file.mimetype.toLowerCase() !== `image/${format}`
      || !(format === 'jpeg' ? ['.jpg', '.jpeg'].includes(extension) : extension === `.${format}`)
      || animated(file.buffer, format)) throw badPhoto();
    try {
      const source = sharp(file.buffer, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
      const metadata = await source.metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS
        || metadata.format !== format || (metadata.pages ?? 1) > 1) throw badPhoto();
      // Apply orientation, flatten transparency, rasterize and omit all source metadata.
      const buffer = await source.rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).timeout({ seconds: 15 }).toBuffer();
      if (buffer.length > MAX_PHOTO_BYTES) throw badPhoto();
      prepared.push({ buffer, sourceHash: createHash('sha256').update(file.buffer).digest('hex'), sha256: createHash('sha256').update(buffer).digest('hex') });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw badPhoto();
    }
  }
  return prepared;
}
