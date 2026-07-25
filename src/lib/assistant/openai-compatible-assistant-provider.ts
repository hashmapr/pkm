import OpenAI from 'openai';
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

/**
 * Drives AssistantProvider through any backend that speaks the OpenAI
 * chat-completions dialect — Ollama and NVIDIA NIM both do, so this one class
 * covers both instead of a separate adapter per local/self-hosted vendor.
 */
export interface OpenAICompatibleAssistantProviderOptions {
  baseURL: string;
  apiKey?: string;
  model: string;
}

export class OpenAICompatibleAssistantProvider implements AssistantProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAICompatibleAssistantProviderOptions) {
    this.client = new OpenAI({ baseURL: options.baseURL, apiKey: options.apiKey ?? 'not-needed' });
    this.model = options.model;
  }

  private async complete(prompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: ASSISTANT_JSON_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      });

      const text = response.choices[0]?.message?.content;
      if (!text) {
        throw new AssistantProviderError('OpenAI-compatible response contained no text content');
      }
      return text;
    } catch (err) {
      if (err instanceof AssistantProviderError) throw err;
      throw new AssistantProviderError('OpenAI-compatible chat request failed', err);
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
