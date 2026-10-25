export const MAX_PHOTOS = 2;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export interface ImageFormat { mime: ImageMime; extension: 'jpg' | 'png' | 'webp' }

const formats: Record<ImageMime, ImageFormat> = {
  'image/jpeg': { mime: 'image/jpeg', extension: 'jpg' },
  'image/png': { mime: 'image/png', extension: 'png' },
  'image/webp': { mime: 'image/webp', extension: 'webp' },
};

function identifyImage(bytes: Uint8Array): ImageMime | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';
  if ([82, 73, 70, 70].every((value, index) => bytes[index] === value)
    && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value)) return 'image/webp';
  return null;
}

/** Check declared type, extension and actual file bytes before asking the browser to decode. */
export async function inspectPhotoFile(file: File): Promise<ImageFormat> {
  if (!file.size) throw new Error('빈 파일은 첨부할 수 없어요. 다른 사진을 선택해 주세요.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('사진은 한 장당 10MB 이하로 첨부해 주세요.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  const expectedMime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
    : extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : null;
  if (!expectedMime || file.type.toLowerCase() !== expectedMime) {
    throw new Error('JPG, PNG, WebP 사진만 첨부할 수 있어요. 파일 형식과 확장자를 확인해 주세요.');
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (identifyImage(bytes) !== expectedMime) {
    throw new Error('사진의 실제 형식이 확장자와 달라요. 원본 사진을 다시 선택해 주세요.');
  }
  return formats[expectedMime];
}

async function decodePhoto(file: File): Promise<void> {
  const source = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        image.onload = null;
        image.onerror = null;
        reject(new Error('사진을 확인하는 데 시간이 오래 걸려요. 다른 사진을 선택해 주세요.'));
      }, 15_000);
      image.onload = () => {
        window.clearTimeout(timeout);
        if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve();
        else reject(new Error('사진을 열 수 없어요. 원본 사진을 다시 선택해 주세요.'));
      };
      image.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('손상되었거나 열 수 없는 사진이에요. 다른 사진을 선택해 주세요.'));
      };
      image.src = source;
    });
  } finally {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    URL.revokeObjectURL(source);
  }
}

export async function validatePhotoFile(file: File): Promise<ImageFormat> {
  const format = await inspectPhotoFile(file);
  await decodePhoto(file);
  return format;
}

/** randomUUID is unavailable on insecure HTTP; getRandomValues remains available. */
export function createPhotoId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
