import Anthropic from '@anthropic-ai/sdk';
import { AssistantProviderError } from './errors';
import { parseAssistantAnswer } from './schemas';
import {
  ASSISTANT_JSON_SYSTEM_PROMPT,
  buildAnswerQuestionPrompt,
  buildCompareKnowledgePrompt,
  buildFindConflictsPrompt,
  buildSummarizeKnowledgePrompt,
} from './prompts';
import type { AssistantProvider, AssistantQueryInput } from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-5';

export interface ClaudeAssistantProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class ClaudeAssistantProvider implements AssistantProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(options: ClaudeAssistantProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? 2048;
  }

  private async complete(prompt: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: ASSISTANT_JSON_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new AssistantProviderError('Claude response contained no text content');
      }
      return textBlock.text;
    } catch (err) {
      if (err instanceof AssistantProviderError) throw err;
      throw new AssistantProviderError('Claude API request failed', err);
    }
  }

  async answerQuestion(input: AssistantQueryInput) {
    const raw = await this.complete(buildAnswerQuestionPrompt(input.question, input.context, input.history));
    return parseAssistantAnswer(raw);
  }

  async summarizeKnowledge(input: AssistantQueryInput) {
    const raw = await this.complete(buildSummarizeKnowledgePrompt(input.question, input.context, input.history));
    return parseAssistantAnswer(raw);
  }

  async compareKnowledge(input: AssistantQueryInput) {
    const raw = await this.complete(buildCompareKnowledgePrompt(input.question, input.context, input.history));
    return parseAssistantAnswer(raw);
  }

  async findConflicts(input: AssistantQueryInput) {
    const raw = await this.complete(buildFindConflictsPrompt(input.question, input.context, input.history));
    return parseAssistantAnswer(raw);
  }
}
