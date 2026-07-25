export interface VisionInput {
  buffer: Buffer;
  mimeType: string;
  /** What to emphasize — a screenshot's UI/app context vs. a photo/scan's subject matter. */
  kind: 'IMAGE' | 'SCREENSHOT';
}

export interface VisionResult {
  description: string;
  /** Transcribed visible text, if any — empty string when there's none to read. */
  extractedText: string;
}

/**
 * Provider-agnostic image understanding (description + OCR). Its own
 * abstraction, not new AIProvider methods — same reasoning as Transcription/
 * Embeddings/Assistant being separate from AI: a genuinely different
 * capability (multimodal input) from a vendor that could plausibly differ
 * from the text-only AIProvider later.
 */
export interface VisionProvider {
  describeImage(input: VisionInput): Promise<VisionResult>;
}
