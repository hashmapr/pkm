import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { VisionProviderError, VisionResponseValidationError } from './errors';
import type { VisionInput, VisionProvider, VisionResult } from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-5';

const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

const visionResultSchema = z.object({
  description: z.string().trim().min(1),
  extractedText: z.string().trim().default(''),
});

const JSON_SYSTEM_PROMPT =
  'You are an image-understanding assistant. Respond with a single JSON value only — ' +
  'no markdown code fences, no prose before or after. If there is no readable text in ' +
  'the image, return an empty string for extractedText rather than omitting it.';

function promptFor(kind: VisionInput['kind']): string {
  if (kind === 'SCREENSHOT') {
    return (
      'This image is a screenshot. Identify what app, website, or interface is shown and ' +
      'summarize what it displays (in "description"), and transcribe all visible text as ' +
      'accurately as possible, preserving structure where it matters (code, tables, lists) ' +
      '(in "extractedText").\n\n' +
      'Return JSON matching exactly this shape:\n{ "description": string, "extractedText": string }'
    );
  }
  return (
    'Describe what is shown in this image (in "description"), and transcribe any visible ' +
    'text verbatim if there is any (in "extractedText", empty string if there is none).\n\n' +
    'Return JSON matching exactly this shape:\n{ "description": string, "extractedText": string }'
  );
}

function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;
  const trimmed = candidate.trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) return trimmed;
  return trimmed.slice(firstBrace, lastBrace + 1);
}

export interface ClaudeVisionProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class ClaudeVisionProvider implements VisionProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(options: ClaudeVisionProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? 1024;
  }

  async describeImage(input: VisionInput): Promise<VisionResult> {
    if (!SUPPORTED_MEDIA_TYPES.includes(input.mimeType as SupportedMediaType)) {
      throw new VisionProviderError(
        `Unsupported image type "${input.mimeType}" — Claude vision accepts ${SUPPORTED_MEDIA_TYPES.join(', ')}`,
      );
    }

    let raw: string;
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: JSON_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: input.mimeType as SupportedMediaType, data: input.buffer.toString('base64') },
              },
              { type: 'text', text: promptFor(input.kind) },
            ],
          },
        ],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new VisionProviderError('Claude vision response contained no text content');
      }
      raw = textBlock.text;
    } catch (err) {
      if (err instanceof VisionProviderError) throw err;
      throw new VisionProviderError('Claude vision API request failed', err);
    }

    let json: unknown;
    try {
      json = JSON.parse(extractJsonPayload(raw));
    } catch (err) {
      throw new VisionResponseValidationError('Vision response was not valid JSON', raw, err);
    }

    const result = visionResultSchema.safeParse(json);
    if (!result.success) {
      throw new VisionResponseValidationError('Vision response did not match the expected shape', raw, result.error.flatten());
    }
    return result.data;
  }
}
