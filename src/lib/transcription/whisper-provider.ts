import OpenAI, { toFile } from 'openai';
import { TranscriptionProviderError } from './errors';
import type { TranscriptionInput, TranscriptionProvider, TranscriptionResult } from './types';

const DEFAULT_MODEL = 'whisper-1';

export interface WhisperProviderOptions {
  apiKey: string;
  model?: string;
}

export class WhisperTranscriptionProvider implements TranscriptionProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: WhisperProviderOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_MODEL;
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    try {
      const file = await toFile(input.buffer, input.filename, { type: input.mimeType });
      const response = await this.client.audio.transcriptions.create({
        file,
        model: this.model,
        response_format: 'verbose_json',
      });

      return {
        text: response.text,
        durationSeconds:
          'duration' in response && typeof response.duration === 'number' ? response.duration : undefined,
      };
    } catch (err) {
      throw new TranscriptionProviderError('Whisper transcription request failed', err);
    }
  }
}
