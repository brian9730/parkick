import { inspectPhotoFile, MAX_PHOTO_BYTES, type ImageFormat } from './validation';

const MAX_PIXELS = 40_000_000;
const MAX_EDGE = 2560;
const JPEG_QUALITY = 0.85;
const TIMEOUT_MS = 15_000;

function invalidPhoto(): Error {
  return new Error('손상되었거나 열 수 없는 사진이에요. 다른 사진을 선택해 주세요.');
}

function rejectAnimation(): never {
  throw new Error('움직이는 사진은 첨부할 수 없어요. JPG·PNG·WebP 정지 사진을 선택해 주세요.');
}

function dimensions(width: number, height: number) {
  if (!width || !height) throw invalidPhoto();
  if (width * height > MAX_PIXELS) throw new Error('사진 해상도가 너무 커요. 4,000만 화소 이하의 사진을 선택해 주세요.');
  return { width, height };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

/** Check containers before canvas conversion, which would otherwise hide animation or truncation. */
function inspectStaticImage(bytes: Uint8Array, format: ImageFormat) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const name = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (format.mime === 'image/jpeg') {
    if (bytes.length < 4) throw invalidPhoto();
    let frame: ReturnType<typeof dimensions> | undefined;
    let offset = 2;
    let inScan = false;
    let hasScan = false;
    while (offset < bytes.length) {
      // Entropy data escapes literal FF bytes as FF00; restart markers have no length.
      if (inScan) while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
      if (bytes[offset++] !== 0xff) throw invalidPhoto();
      while (bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) throw invalidPhoto();
      const marker = bytes[offset++];
      if (inScan && (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7))) continue;
      // The primary JPEG can be followed by Motion Photo video or other camera data.
      // Parse markers to its EOI instead of mistaking EOI bytes inside APP metadata for it.
      if (marker === 0xd9) {
        if (!frame || !hasScan) throw invalidPhoto();
        return frame;
      }
      if (marker === 0x01) continue; // Standalone TEM marker.
      if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) throw invalidPhoto();
      inScan = false;
      if (offset + 2 > bytes.length) throw invalidPhoto();
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) throw invalidPhoto();
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (size < 8 || frame) throw invalidPhoto();
        frame = dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      }
      if (marker === 0xda) {
        if (!frame) throw invalidPhoto();
        inScan = true;
        hasScan = true;
      }
      offset += size;
    }
    throw invalidPhoto();
  }

  if (format.mime === 'image/png') {
    let offset = 8;
    let frame: ReturnType<typeof dimensions> | undefined;
    let hasImage = false;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset);
      const end = offset + 12 + size;
      if (end > bytes.length) throw invalidPhoto();
      const chunk = name(offset + 4);
      if (['acTL', 'fcTL', 'fdAT'].includes(chunk)) rejectAnimation();
      if (offset === 8 && chunk !== 'IHDR') throw invalidPhoto();
      if (chunk === 'IHDR') {
        if (frame || size !== 13) throw invalidPhoto();
        frame = dimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
      }
      // Some browser decoders tolerate bad CRCs; do not turn those inputs into valid JPEGs.
      let crc = 0xffffffff;
      for (let cursor = offset + 4; cursor < end - 4; cursor += 1) crc = crcTable[(crc ^ bytes[cursor]) & 0xff] ^ (crc >>> 8);
      if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end - 4)) throw invalidPhoto();
      if (chunk === 'IDAT') hasImage = true;
      if (chunk === 'IEND') {
        if (size || end !== bytes.length || !frame || !hasImage) throw invalidPhoto();
        return frame;
      }
      offset = end;
    }
    throw invalidPhoto();
  }

  if (bytes.length < 20 || view.getUint32(4, true) + 8 !== bytes.length) throw invalidPhoto();
  let offset = 12;
  let frame: ReturnType<typeof dimensions> | undefined;
  let canvas: ReturnType<typeof dimensions> | undefined;
  while (offset + 8 <= bytes.length) {
    const chunk = name(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size + size % 2;
    if (end > bytes.length) throw invalidPhoto();
    if (chunk === 'ANIM' || chunk === 'ANMF') rejectAnimation();
    if (chunk === 'VP8X') {
      if (size !== 10 || canvas) throw invalidPhoto();
      if (bytes[start] & 2) rejectAnimation();
      const uint24 = (at: number) => bytes[at] + (bytes[at + 1] << 8) + (bytes[at + 2] << 16);
      canvas = dimensions(uint24(start + 4) + 1, uint24(start + 7) + 1);
    }
    if (chunk === 'VP8 ' || chunk === 'VP8L') {
      if (frame) throw invalidPhoto();
      if (chunk === 'VP8 ') {
        if (size < 10 || (bytes[start] & 1) || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 1 || bytes[start + 5] !== 0x2a) throw invalidPhoto();
        frame = dimensions(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff);
      } else {
        if (size < 5 || bytes[start] !== 0x2f) throw invalidPhoto();
        const bits = view.getUint32(start + 1, true);
        frame = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      }
    }
    offset = end;
  }
  if (offset !== bytes.length || !frame || (canvas && (canvas.width !== frame.width || canvas.height !== frame.height))) throw invalidPhoto();
  return frame;
}

/** Prepare one stable upload File once; QR photos never call this evidence-only path. */
export async function optimizePhoto(original: File, id: string, signal?: AbortSignal): Promise<File> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason ?? new DOMException('Photo preparation cancelled', 'AbortError'));
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(new Error('사진을 준비하는 데 시간이 오래 걸려요. 다른 사진을 선택해 주세요.')), TIMEOUT_MS);
  const check = () => controller.signal.throwIfAborted();
  const image = new Image();
  const canvas = document.createElement('canvas');
  let source: string | undefined;

  // An abort rejects pending browser work promptly; late callbacks cannot commit any result.
  function wait<T>(start: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const finish = (callback: () => void) => { controller.signal.removeEventListener('abort', onAbort); callback(); };
      const onAbort = () => finish(() => reject(controller.signal.reason));
      controller.signal.addEventListener('abort', onAbort, { once: true });
      if (controller.signal.aborted) { onAbort(); return; }
      try { start(value => finish(() => resolve(value)), reason => finish(() => reject(reason))); }
      catch (cause) { finish(() => reject(cause)); }
    });
  }

  try {
    check();
    const format = await inspectPhotoFile(original); // Keep the original 10 MiB limit before compression.
    check();
    const bytes = await wait<ArrayBuffer>((resolve, reject) => { void original.arrayBuffer().then(resolve, reject); });
    inspectStaticImage(new Uint8Array(bytes), format); // Reject over 40 MP before a browser allocates decoded pixels.
    check();
    source = URL.createObjectURL(original);
    await wait<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(invalidPhoto());
      image.src = source!;
    });
    check();
    // Modern browser image decoding applies EXIF orientation before drawImage.
    const { width, height } = dimensions(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('사진을 준비하지 못했어요. 다른 브라우저에서 다시 시도해 주세요.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = await wait<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob?.size && blob.type === 'image/jpeg' ? resolve(blob) : reject(invalidPhoto()), 'image/jpeg', JPEG_QUALITY);
    });
    check();
    // Do not enlarge already small photos. Original metadata is stripped by the server on storage.
    const keepOriginal = scale === 1 && compressed.size >= original.size;
    const content = keepOriginal ? original : compressed;
    if (content.size > MAX_PHOTO_BYTES) throw new Error('사진 용량을 충분히 줄이지 못했어요. 다른 사진을 선택해 주세요.');
    return new File([content], `${id}.${keepOriginal ? format.extension : 'jpg'}`, {
      type: keepOriginal ? format.mime : 'image/jpeg', lastModified: original.lastModified,
    });
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    if (source) URL.revokeObjectURL(source);
    canvas.width = canvas.height = 0;
  }
}
