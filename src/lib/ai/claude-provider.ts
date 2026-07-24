import Anthropic from '@anthropic-ai/sdk';
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

const DEFAULT_MODEL = 'claude-sonnet-4-5';

export interface ClaudeProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class ClaudeProvider implements AIProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(options: ClaudeProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? 4096;
  }

  private async complete(prompt: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: JSON_ONLY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new AIProviderError('Claude response contained no text content');
      }
      return textBlock.text;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      throw new AIProviderError('Claude API request failed', err);
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
