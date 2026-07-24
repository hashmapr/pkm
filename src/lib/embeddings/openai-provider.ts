import OpenAI from 'openai';
import { EmbeddingProviderError } from './errors';
import type { EmbeddingProvider } from './types';

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 1536;

export interface OpenAIEmbeddingProviderOptions {
  apiKey: string;
  model?: string;
  dimensions?: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  readonly model: string;
  readonly dimensions: number;

  constructor(options: OpenAIEmbeddingProviderOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_MODEL;
    this.dimensions = options.dimensions ?? DEFAULT_DIMENSIONS;
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
        dimensions: this.dimensions,
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
