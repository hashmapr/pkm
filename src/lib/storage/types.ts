export interface UploadInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface UploadResult {
  key: string;
}

/**
 * Provider-agnostic file storage. Local filesystem today; swapping to S3/R2
 * means writing one adapter (upload -> PutObject, read -> GetObject, getUrl ->
 * presigned URL) without touching any call site.
 *
 * `read` isn't part of the originally specified 3-method surface (upload/
 * delete/getUrl) but is structurally required: transcription needs the raw
 * bytes back, and no other method provides them.
 */
export interface StorageProvider {
  upload(input: UploadInput): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  read(key: string): Promise<Buffer>;
}
