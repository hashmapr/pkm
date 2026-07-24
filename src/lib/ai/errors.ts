/** The provider's underlying call failed (network, auth, rate limit, upstream 5xx). */
export class AIProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AIProviderError';
  }
}

/** The provider responded, but the response wasn't valid JSON or didn't match the expected schema. */
export class AIResponseValidationError extends Error {
  constructor(message: string, readonly rawResponse?: string, readonly issues?: unknown) {
    super(message);
    this.name = 'AIResponseValidationError';
  }
}
