import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { uploadAudio, transcribeSavedItemAudio } from '../audio';
import type { StorageProvider } from '@/lib/storage/types';
import type { TranscriptionProvider } from '@/lib/transcription/types';
import type { AIProvider } from '@/lib/ai/types';
import type { AIExtractionResult } from '@/lib/ai/extraction';
import type { EmbeddingProvider } from '@/lib/embeddings/types';

/**
 * True end-to-end coverage of "transcription -> content update -> existing
 * Phase 2 pipeline runs unchanged" needs a real database — the rest of the
 * suite stays DB-free (see processing.test.ts/audio.test.ts), but this one
 * test earns the dependency. Skips cleanly if no database is reachable so it
 * never blocks `npm test` in an environment without one.
 */
let dbAvailable = true;
try {
  await db.$queryRaw`SELECT 1`;
} catch {
  dbAvailable = false;
}

function inMemoryStorage(): StorageProvider {
  const files = new Map<string, Buffer>();
  return {
    async upload(input) {
      const key = `test-${files.size}-${input.filename}`;
      files.set(key, input.buffer);
      return { key };
    },
    async delete(key) {
      files.delete(key);
    },
    getUrl(key) {
      return `/api/audio/file/${key}`;
    },
    async read(key) {
      const buffer = files.get(key);
      if (!buffer) throw new Error(`no file for key ${key}`);
      return buffer;
    },
  };
}

const fakeAIResult: AIExtractionResult = {
  summary: 'A voice note about agent orchestration.',
  keyPoints: ['Agents need durable memory'],
  tags: ['ai', 'agents'],
  entities: [{ name: 'LangGraph', type: 'TECHNOLOGY', confidence: 0.9 }],
  tasks: [{ title: 'Prototype an orchestrator', priority: 'HIGH', confidence: 0.8 }],
  decisions: [{ statement: 'Use a graph-based orchestrator', confidence: 0.7 }],
  questions: [{ question: 'Which framework handles long-running state best?' }],
};

const fakeAIProvider: AIProvider = {
  summarize: async () => fakeAIResult.summary,
  extractEntities: async () => fakeAIResult.entities,
  extractTasks: async () => fakeAIResult.tasks,
  classifyItem: async () => ({ type: 'VOICE', confidence: 0.9 }),
  generateTags: async () => fakeAIResult.tags,
  findRelationships: async () => [],
  analyze: async () => fakeAIResult,
};

const fakeEmbeddingProvider: EmbeddingProvider = {
  model: 'fake-embedding-model',
  dimensions: 1536,
  generateEmbedding: async () => new Array(1536).fill(0),
  generateEmbeddings: async (texts) => texts.map(() => new Array(1536).fill(0)),
};

describe.skipIf(!dbAvailable)('audio pipeline integration', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.upsert({
      where: { email: 'phase3-smoke@test.dev' },
      create: { email: 'phase3-smoke@test.dev', passwordHash: 'x' },
      update: {},
    });
    userId = user.id;
  });

  afterAll(async () => {
    await db.savedItem.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it('transcribes audio, updates content, and runs the existing processing pipeline', async () => {
    const storage = inMemoryStorage();
    const transcriptionProvider: TranscriptionProvider = {
      transcribe: async () => ({ text: 'Thinking about agent orchestration frameworks.', durationSeconds: 42 }),
    };

    const { item } = await uploadAudio(
      userId,
      { buffer: Buffer.from('fake audio'), filename: 'note.mp3', mimeType: 'audio/mpeg', title: 'Voice memo' },
      storage,
    );
    expect(item.type).toBe('VOICE');

    const audioAttachment = await transcribeSavedItemAudio(
      userId,
      item.id,
      transcriptionProvider,
      storage,
      fakeAIProvider,
      fakeEmbeddingProvider,
    );

    expect(audioAttachment.transcriptionStatus).toBe('COMPLETED');
    expect(audioAttachment.transcript).toBe('Thinking about agent orchestration frameworks.');
    expect(audioAttachment.duration).toBe(42);

    const processed = await db.savedItem.findUnique({
      where: { id: item.id },
      include: { extractedTasks: true, extractedEntities: true, decisions: true, questions: true },
    });

    expect(processed?.content).toBe('Thinking about agent orchestration frameworks.');
    expect(processed?.status).toBe('COMPLETED');
    expect(processed?.summary).toBe(fakeAIResult.summary);
    expect(processed?.extractedTasks).toHaveLength(1);
    expect(processed?.extractedEntities).toHaveLength(1);
    expect(processed?.decisions).toHaveLength(1);
    expect(processed?.questions).toHaveLength(1);
  });

  it('marks the attachment FAILED and does not touch SavedItem.content when transcription fails', async () => {
    const storage = inMemoryStorage();
    const failingProvider: TranscriptionProvider = {
      transcribe: async () => {
        throw new Error('simulated upstream failure');
      },
    };

    const { item } = await uploadAudio(
      userId,
      { buffer: Buffer.from('fake audio'), filename: 'note2.mp3', mimeType: 'audio/mpeg', title: 'Voice memo 2' },
      storage,
    );

    const audioAttachment = await transcribeSavedItemAudio(
      userId,
      item.id,
      failingProvider,
      storage,
      fakeAIProvider,
      fakeEmbeddingProvider,
    );

    expect(audioAttachment.transcriptionStatus).toBe('FAILED');
    expect(audioAttachment.transcript).toBeNull();

    const untouched = await db.savedItem.findUnique({ where: { id: item.id } });
    expect(untouched?.content).toBeNull();
    expect(untouched?.status).toBe('PENDING');
  });
});
