import { useEffect, useRef, useState } from 'react';
import { createPhotoId, MAX_PHOTOS } from './validation';
import { optimizePhoto } from './optimize-photo';

export interface PhotoEvidence {
  id: string;
  file: File;
  previewUrl: string;
  originalName: string;
}

export interface PhotoEvidenceController {
  photos: PhotoEvidence[];
  busy: boolean;
  error: string | null;
  add: (files: File[]) => Promise<void>;
  replace: (id: string, file: File) => Promise<void>;
  remove: (id: string) => void;
  clearError: () => void;
}

/** Own this hook at the wizard level so changing steps keeps File objects in memory. */
export function usePhotoEvidence(): PhotoEvidenceController {
  const [photos, setPhotos] = useState<PhotoEvidence[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = useRef<PhotoEvidence[]>([]);
  const processing = useRef(false);
  const generation = useRef(0);
  const preparation = useRef<AbortController | null>(null);

  useEffect(() => () => {
    generation.current += 1;
    preparation.current?.abort();
    preparation.current = null;
    for (const photo of items.current) URL.revokeObjectURL(photo.previewUrl);
    items.current = [];
    processing.current = false;
  }, []);

  async function process(files: File[], replacementId?: string): Promise<void> {
    if (!files.length || processing.current) return;
    if (!replacementId && files.length + items.current.length > MAX_PHOTOS) {
      setError(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있어요. 선택한 사진 수를 줄여 주세요.`);
      return;
    }
    if (replacementId && !items.current.some(photo => photo.id === replacementId)) return;
    const currentGeneration = generation.current;
    const prepared: PhotoEvidence[] = [];
    const controller = new AbortController();
    preparation.current = controller;
    processing.current = true;
    setBusy(true);
    setError(null);
    try {
      // Validate the entire batch before committing. Invalid selections never partially replace existing evidence.
      for (const original of files) {
        const id = createPhotoId();
        const file = await optimizePhoto(original, id, controller.signal);
        if (currentGeneration !== generation.current) return;
        prepared.push({ id, file, previewUrl: URL.createObjectURL(file), originalName: original.name });
      }
      if (currentGeneration !== generation.current) return;
      if (replacementId) {
        const previous = items.current.find(photo => photo.id === replacementId);
        if (!previous) return;
        items.current = items.current.map(photo => photo.id === replacementId ? prepared[0] : photo);
        URL.revokeObjectURL(previous.previewUrl);
      } else {
        if (items.current.length + prepared.length > MAX_PHOTOS) throw new Error(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있어요.`);
        items.current = [...items.current, ...prepared];
      }
      setPhotos(items.current);
      prepared.length = 0; // Ownership of these URLs has moved to the mounted hook.
    } catch (cause) {
      if (currentGeneration === generation.current) {
        setError(cause instanceof Error ? cause.message : '사진을 첨부하지 못했어요. 다시 선택해 주세요.');
      }
    } finally {
      for (const photo of prepared) URL.revokeObjectURL(photo.previewUrl);
      if (currentGeneration === generation.current) {
        preparation.current = null;
        processing.current = false;
        setBusy(false);
      }
    }
  }

  function remove(id: string) {
    const previous = items.current.find(photo => photo.id === id);
    if (!previous) return;
    items.current = items.current.filter(photo => photo.id !== id);
    URL.revokeObjectURL(previous.previewUrl);
    setPhotos(items.current);
    setError(null);
  }

  return { photos, busy, error, add: files => process(files), replace: (id, file) => process([file], id), remove, clearError: () => setError(null) };
}
