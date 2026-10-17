export type EvidenceMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface EvidenceUploadRequest {
  contentType: EvidenceMimeType;
  sizeBytes: number;
  /** Ownership is an anonymous report-draft capability, never a client-selected S3 path. */
  draftId: string;
}

export interface SignedUpload {
  objectKey: string;
  uploadUrl: string;
  method: 'PUT' | 'POST';
  headers: Readonly<Record<string, string>>;
  fields?: Readonly<Record<string, string>>;
  expiresAt: Date;
}

/** Phase 4 contract: validate MIME/size/magic bytes, strip EXIF, generate UUID keys, keep bucket private. */
export interface StorageProvider {
  createUpload(request: EvidenceUploadRequest): Promise<SignedUpload>;
  confirmUpload(objectKey: string, draftId: string): Promise<void>;
  createPrivateReadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
  deleteObject(objectKey: string): Promise<void>;
}
