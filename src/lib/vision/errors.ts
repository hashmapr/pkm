export class VisionProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'VisionProviderError';
  }
}

export class VisionResponseValidationError extends Error {
  constructor(message: string, readonly rawResponse?: string, readonly issues?: unknown) {
    super(message);
    this.name = 'VisionResponseValidationError';
  }
}
