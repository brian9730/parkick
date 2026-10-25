import type QrScanner from 'qr-scanner';

/** Decode locally at several scales; the original photo is never changed or uploaded. */
export async function scanQrImage(Scanner: typeof QrScanner, file: File, isCurrent: () => boolean): Promise<QrScanner.ScanResult> {
  const source = URL.createObjectURL(file);
  const image = new Image();
  let engine: Awaited<ReturnType<typeof Scanner.createQrEngine>> | undefined;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const cancelled = () => { if (!isCurrent()) throw new DOMException('QR scan cancelled', 'AbortError'); };
  try {
    image.src = source;
    await image.decode();
    cancelled();
    if (!context || image.naturalWidth * image.naturalHeight > 64_000_000) throw new Error('사진 크기가 너무 커요. QR이 잘 보이도록 가까이 촬영해 주세요.');
    engine = await Scanner.createQrEngine();
    cancelled();
    const deadline = performance.now() + 8000;
    const attempt = async (target: HTMLImageElement | HTMLCanvasElement) => {
      cancelled();
      if (performance.now() > deadline) return null;
      try { return await Scanner.scanImage(target, { qrEngine: engine, returnDetailedScanResult: true }); }
      catch { cancelled(); return null; }
    };
    const original = await attempt(image);
    if (original) return original;
    const width = image.naturalWidth; const height = image.naturalHeight;
    // Reducing camera noise can recover QR symbols that fail at full resolution.
    for (const maxSide of [2048, 1024]) {
      const scale = Math.min(1, maxSide / Math.max(width, height));
      canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = await attempt(canvas);
      if (result) return result;
    }
    // A QR may occupy only a small part of a full vehicle photo. Keep its
    // native detail in overlapping crops and try each orientation; damaged
    // stickers can decode at a different rotation even when the library's
    // whole-image scan fails.
    const quarter = Math.min(width, height) / 4;
    for (const y of [0.65, 0.5, 0.35]) {
      for (const x of [0.5, 0.35, 0.65]) {
        const cropX = (width - quarter) * x;
        const cropY = (height - quarter) * y;
        for (const angle of [0, 270, 90, 180]) {
          canvas.width = canvas.height = 600;
          context.save();
          context.translate(300, 300);
          context.rotate(angle * Math.PI / 180);
          context.drawImage(image, cropX, cropY, quarter, quarter, -300, -300, 600, 600);
          context.restore();
          const result = await attempt(canvas);
          if (result) return result;
        }
      }
    }
    // Center first, then overlapping image regions; no vehicle-specific coordinates.
    const shorter = Math.min(width, height);
    const regions = [
      ...[1 / 3, 1 / 2, 1].map(fraction => {
        const side = shorter * fraction;
        return { x: (width - side) / 2, y: (height - side) / 2, side };
      }),
      ...[0, 0.5, 1].flatMap(y => [0, 0.5, 1].map(x => ({ x: (width - shorter / 2) * x, y: (height - shorter / 2) * y, side: shorter / 2 }))),
    ];
    for (const region of regions) {
      for (const size of [300, 450]) {
        canvas.width = canvas.height = size;
        context.drawImage(image, region.x, region.y, region.side, region.side, 0, 0, size, size);
        const pixels = context.getImageData(0, 0, size, size);
        for (const threshold of [null, 80, 120, 160]) {
          cancelled();
          if (performance.now() > deadline) throw new Error('QR 사진을 읽지 못했어요. QR이 화면을 채우도록 가까이 촬영하거나 업체를 선택해 주세요.');
          if (threshold !== null) {
            const adjusted = new ImageData(new Uint8ClampedArray(pixels.data), size, size);
            for (let i = 0; i < pixels.data.length; i += 4) {
              const value = pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114 >= threshold ? 255 : 0;
              adjusted.data[i] = adjusted.data[i + 1] = adjusted.data[i + 2] = value;
            }
            context.putImageData(adjusted, 0, 0);
          }
          const result = await attempt(canvas);
          if (result) return result;
        }
      }
    }
    throw new Error('사진에서 QR 코드를 찾지 못했어요. 선명한 QR 사진을 다시 선택하거나 업체를 선택해 주세요.');
  } finally {
    if (engine instanceof Worker) engine.terminate();
    image.removeAttribute('src');
    URL.revokeObjectURL(source);
    canvas.width = canvas.height = 0;
  }
}
