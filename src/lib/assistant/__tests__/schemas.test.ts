import { describe, expect, it } from 'vitest';
import { AssistantResponseValidationError } from '../errors';
import { parseAssistantAnswer } from '../schemas';

const validResponse = {
  answer: 'You chose PostgreSQL because it already supported pgvector for embeddings.',
  sourceIndexes: [1, 2],
  confidence: 0.85,
  suggestedActions: [{ type: 'CREATE_PROJECT', label: 'Create a "Database" project', payload: { name: 'Database' } }],
};

describe('parseAssistantAnswer — source attribution & response parsing', () => {
  it('parses a well-formed JSON response', () => {
    const result = parseAssistantAnswer(JSON.stringify(validResponse));
    expect(result.answer).toBe(validResponse.answer);
    expect(result.sourceIndexes).toEqual([1, 2]);
    expect(result.confidence).toBe(0.85);
    expect(result.suggestedActions).toHaveLength(1);
  });

  it('strips markdown code fences before parsing', () => {
    const fenced = '```json\n' + JSON.stringify(validResponse) + '\n```';
    expect(parseAssistantAnswer(fenced).answer).toBe(validResponse.answer);
  });

  it('defaults sourceIndexes and suggestedActions to empty arrays when omitted', () => {
    const minimal = { answer: 'No sources needed for this.', confidence: 0.5 };
    const result = parseAssistantAnswer(JSON.stringify(minimal));
    expect(result.sourceIndexes).toEqual([]);
    expect(result.suggestedActions).toEqual([]);
  });
});

describe('parseAssistantAnswer — malformed responses', () => {
  it('throws AssistantResponseValidationError on malformed JSON', () => {
    expect(() => parseAssistantAnswer('{ not valid json')).toThrow(AssistantResponseValidationError);
  });

  it('throws when the required answer field is missing', () => {
    expect(() => parseAssistantAnswer(JSON.stringify({ confidence: 0.5 }))).toThrow(
      AssistantResponseValidationError,
    );
  });

  it('throws when confidence is out of the 0-1 range', () => {
    expect(() =>
      parseAssistantAnswer(JSON.stringify({ answer: 'x', confidence: 1.5 })),
    ).toThrow(AssistantResponseValidationError);
  });

  it('throws when a suggested action has an invalid type', () => {
    const bad = {
      answer: 'x',
      confidence: 0.5,
      suggestedActions: [{ type: 'DELETE_EVERYTHING', label: 'nope', payload: {} }],
    };
    expect(() => parseAssistantAnswer(JSON.stringify(bad))).toThrow(AssistantResponseValidationError);
  });
});
