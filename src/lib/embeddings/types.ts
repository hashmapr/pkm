/**
 * Provider-agnostic embedding generation. Deliberately its own abstraction —
 * not folded into AIProvider or TranscriptionProvider — since it's a
 * different capability from a (potentially) different vendor, and swapping
 * any one of the three shouldn't require touching the others.
 */
export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  readonly model: string;
  readonly dimensions: number;
}
