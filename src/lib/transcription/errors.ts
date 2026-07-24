export class TranscriptionProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'TranscriptionProviderError';
  }
}
