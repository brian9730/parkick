export interface EvidenceUpload { originalname: string; mimetype: string; buffer: Buffer }
export interface PreparedEvidence { buffer: Buffer; sourceHash: string; sha256: string }
export interface StoredEvidence { objectKey: string; mimeType: string; sizeBytes: number; sha256: string; exifRemoved: boolean }
/** directory identifies only this save attempt, never a report or a client-supplied path. */
export interface SavedEvidence { directory: string; images: StoredEvidence[] }
export type EvidenceRead = { buffer: Buffer } | { redirect: string };

export interface EvidenceStorage {
  prepare(files: readonly EvidenceUpload[]): Promise<PreparedEvidence[]>;
  save(prepared: readonly PreparedEvidence[]): Promise<SavedEvidence>;
  remove(directory: string): Promise<void>;
  /** Internal only: caller must authorize the owning report and image in the database first. */
  read?(objectKey: string): Promise<EvidenceRead>;
  close?(): void;
}
