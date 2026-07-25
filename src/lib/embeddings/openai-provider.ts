import OpenAI from 'openai';
import { EmbeddingProviderError } from './errors';
import type { EmbeddingProvider } from './types';

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 1536;

export interface OpenAIEmbeddingProviderOptions {
  apiKey: string;
  model?: string;
  dimensions?: number;
  /**
   * Overrides the API base URL. Same OpenAI SDK, same `/v1/embeddings` request
   * shape — this is what lets this one class also drive an OpenAI-compatible
   * local/self-hosted backend (Ollama, NVIDIA NIM) instead of a second class.
   */
  baseURL?: string;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  readonly model: string;
  readonly dimensions: number;
  private readonly supportsDimensionsParam: boolean;

  constructor(options: OpenAIEmbeddingProviderOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });
    this.model = options.model ?? DEFAULT_MODEL;
    this.dimensions = options.dimensions ?? DEFAULT_DIMENSIONS;
    // The `dimensions` request param is an OpenAI-specific extension (only
    // text-embedding-3-* honor it) — most OpenAI-compatible local backends
    // reject an unrecognized field, so only send it against real OpenAI.
    this.supportsDimensionsParam = !options.baseURL;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const [vector] = await this.generateEmbeddings([text]);
    return vector;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        ...(this.supportsDimensionsParam ? { dimensions: this.dimensions } : {}),
        input: texts,
      });
      return response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding as number[]);
    } catch (err) {
      throw new EmbeddingProviderError('OpenAI embedding request failed', err);
    }
  }
}
