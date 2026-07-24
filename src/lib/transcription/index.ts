import { WhisperTranscriptionProvider } from './whisper-provider';
import type { TranscriptionProvider } from './types';

let cachedProvider: TranscriptionProvider | undefined;

/**
 * Returns the configured TranscriptionProvider. Swapping speech-to-text
 * vendors means changing this factory (and adding a new provider class) —
 * no call site changes.
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  if (!cachedProvider) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    cachedProvider = new WhisperTranscriptionProvider({ apiKey, model: process.env.OPENAI_TRANSCRIPTION_MODEL });
  }
  return cachedProvider;
}

export type { TranscriptionProvider } from './types';
export { TranscriptionProviderError } from './errors';
