export class AssistantProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AssistantProviderError';
  }
}

export class AssistantResponseValidationError extends Error {
  constructor(message: string, readonly rawResponse?: string, readonly issues?: unknown) {
    super(message);
    this.name = 'AssistantResponseValidationError';
  }
}
