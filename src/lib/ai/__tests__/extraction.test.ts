import { describe, expect, it } from 'vitest';
import { AIResponseValidationError } from '../errors';
import {
  extractedEntitySchema,
  parseExtractionResponse,
  parseWithSchema,
} from '../extraction';
import { z } from 'zod';

const validResponse = {
  summary: 'A note about building AI agents with orchestration frameworks.',
  keyPoints: ['Agents need memory', 'Orchestration is the hard part'],
  tags: ['ai', 'agents'],
  entities: [{ name: 'LangGraph', type: 'TECHNOLOGY', confidence: 0.9 }],
  tasks: [
    {
      title: 'Prototype an agent orchestrator',
      priority: 'HIGH',
      confidence: 0.8,
    },
  ],
  decisions: [{ statement: 'Use a graph-based orchestrator', confidence: 0.7 }],
  questions: [{ question: 'Which framework handles long-running state best?' }],
};

describe('parseExtractionResponse — AI response parsing', () => {
  it('parses a well-formed JSON response', () => {
    const result = parseExtractionResponse(JSON.stringify(validResponse));
    expect(result.summary).toBe(validResponse.summary);
    expect(result.tags).toEqual(['ai', 'agents']);
    expect(result.tasks[0].priority).toBe('HIGH');
  });

  it('strips markdown code fences before parsing', () => {
    const fenced = '```json\n' + JSON.stringify(validResponse) + '\n```';
    const result = parseExtractionResponse(fenced);
    expect(result.summary).toBe(validResponse.summary);
  });

  it('tolerates leading/trailing prose around the JSON object', () => {
    const decorated = `Sure, here's the analysis:\n${JSON.stringify(validResponse)}\nLet me know if you need more.`;
    const result = parseExtractionResponse(decorated);
    expect(result.summary).toBe(validResponse.summary);
  });

  it('fills in defaults for omitted optional arrays', () => {
    const minimal = { summary: 'Just a summary.' };
    const result = parseExtractionResponse(JSON.stringify(minimal));
    expect(result.keyPoints).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.entities).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.questions).toEqual([]);
  });
});

describe('parseExtractionResponse — failed AI responses', () => {
  it('throws AIResponseValidationError on malformed JSON', () => {
    expect(() => parseExtractionResponse('{ not valid json')).toThrow(AIResponseValidationError);
  });

  it('throws AIResponseValidationError when the required summary field is missing', () => {
    const missingSummary = { tags: ['ai'] };
    expect(() => parseExtractionResponse(JSON.stringify(missingSummary))).toThrow(
      AIResponseValidationError,
    );
  });

  it('throws AIResponseValidationError when summary is empty', () => {
    const emptySummary = { summary: '' };
    expect(() => parseExtractionResponse(JSON.stringify(emptySummary))).toThrow(
      AIResponseValidationError,
    );
  });

  it('throws AIResponseValidationError when the response is a JSON array instead of an object', () => {
    expect(() => parseExtractionResponse('[1, 2, 3]')).toThrow(AIResponseValidationError);
  });

  it('attaches the raw response to the error for debugging', () => {
    try {
      parseExtractionResponse('not json at all');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AIResponseValidationError);
      expect((err as AIResponseValidationError).rawResponse).toBe('not json at all');
    }
  });
});

describe('entity extraction validation', () => {
  const entitiesSchema = z.array(extractedEntitySchema);

  it('accepts a well-formed entities array', () => {
    const raw = JSON.stringify([
      { name: 'Anthropic', type: 'COMPANY', confidence: 0.95 },
      { name: 'Claude', type: 'TECHNOLOGY', confidence: 0.99 },
    ]);
    const entities = parseWithSchema(raw, entitiesSchema, 'extractEntities');
    expect(entities).toHaveLength(2);
    expect(entities[0].type).toBe('COMPANY');
  });

  it('rejects an entity with an invalid type', () => {
    const raw = JSON.stringify([{ name: 'Anthropic', type: 'ORGANIZATION', confidence: 0.9 }]);
    expect(() => parseWithSchema(raw, entitiesSchema, 'extractEntities')).toThrow(
      AIResponseValidationError,
    );
  });

  it('rejects an entity with confidence outside 0-1', () => {
    const raw = JSON.stringify([{ name: 'Anthropic', type: 'COMPANY', confidence: 1.5 }]);
    expect(() => parseWithSchema(raw, entitiesSchema, 'extractEntities')).toThrow(
      AIResponseValidationError,
    );
  });

  it('rejects an entity missing a name', () => {
    const raw = JSON.stringify([{ type: 'COMPANY', confidence: 0.9 }]);
    expect(() => parseWithSchema(raw, entitiesSchema, 'extractEntities')).toThrow(
      AIResponseValidationError,
    );
  });

  it('accepts an empty entities array', () => {
    const entities = parseWithSchema('[]', entitiesSchema, 'extractEntities');
    expect(entities).toEqual([]);
  });
});
