export interface TranscriptionInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface TranscriptionResult {
  text: string;
  durationSeconds?: number;
}

/**
 * Provider-agnostic speech-to-text. Deliberately separate from AIProvider
 * (Phase 2) — transcription is a different capability from a different
 * vendor, and folding it into AIProvider would make swapping either one
 * harder. Once transcribe() returns text, it's handed to the existing
 * SavedItem/ProcessingJob pipeline unchanged.
 */
export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}
