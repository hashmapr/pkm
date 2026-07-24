export class NoCaptureProviderError extends Error {
  constructor() {
    super('No capture provider supports this input');
    this.name = 'NoCaptureProviderError';
  }
}

export class CaptureProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'CaptureProviderError';
  }
}
