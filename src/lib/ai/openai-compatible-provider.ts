import OpenAI from 'openai';
import { AIProviderError } from './errors';
import {
  classificationSchema,
  extractedEntitySchema,
  extractedTaskSchema,
  parseExtractionResponse,
  parseWithSchema,
  relationshipSuggestionSchema,
} from './extraction';
import {
  buildAnalyzePrompt,
  buildClassifyPrompt,
  buildEntitiesPrompt,
  buildRelationshipsPrompt,
  buildSummarizePrompt,
  buildTagsPrompt,
  buildTasksPrompt,
  JSON_ONLY_SYSTEM_PROMPT,
} from './prompts';
import type { AIProvider, RelationshipCandidate, SavedItemForAnalysis } from './types';
import { z } from 'zod';

/**
 * Drives AIProvider through any backend that speaks the OpenAI chat-completions
 * dialect — Ollama (`/v1` compat endpoint) and NVIDIA NIM both do, so this one
 * class covers both instead of a separate adapter per local/self-hosted vendor.
 */
export interface OpenAICompatibleAIProviderOptions {
  baseURL: string;
  apiKey?: string;
  model: string;
}

export class OpenAICompatibleAIProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAICompatibleAIProviderOptions) {
    this.client = new OpenAI({ baseURL: options.baseURL, apiKey: options.apiKey ?? 'not-needed' });
    this.model = options.model;
  }

  private async complete(prompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: JSON_ONLY_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      });

      const text = response.choices[0]?.message?.content;
      if (!text) {
        throw new AIProviderError('OpenAI-compatible response contained no text content');
      }
      return text;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      throw new AIProviderError('OpenAI-compatible chat request failed', err);
    }
  }

  async analyze(input: SavedItemForAnalysis) {
    const raw = await this.complete(buildAnalyzePrompt(input));
    return parseExtractionResponse(raw);
  }

  async summarize(input: SavedItemForAnalysis) {
    const raw = await this.complete(buildSummarizePrompt(input));
    const { summary } = parseWithSchema(raw, z.object({ summary: z.string().trim().min(1) }), 'summarize');
    return summary;
  }

  async extractEntities(input: SavedItemForAnalysis) {
    const raw = await this.complete(buildEntitiesPrompt(input));
    return parseWithSchema(raw, z.array(extractedEntitySchema), 'extractEntities');
  }

  async extractTasks(input: SavedItemForAnalysis) {
    const raw = await this.complete(buildTasksPrompt(input));
    return parseWithSchema(raw, z.array(extractedTaskSchema), 'extractTasks');
  }

  async classifyItem(input: SavedItemForAnalysis) {
    const raw = await this.complete(buildClassifyPrompt(input));
    return parseWithSchema(raw, classificationSchema, 'classifyItem');
  }

  async generateTags(input: SavedItemForAnalysis) {
    const raw = await this.complete(buildTagsPrompt(input));
    return parseWithSchema(raw, z.array(z.string().trim().min(1)), 'generateTags');
  }

  async findRelationships(input: SavedItemForAnalysis, candidates: RelationshipCandidate[]) {
    if (candidates.length === 0) return [];
    const raw = await this.complete(buildRelationshipsPrompt(input, candidates));
    return parseWithSchema(raw, z.array(relationshipSuggestionSchema), 'findRelationships');
  }
}
