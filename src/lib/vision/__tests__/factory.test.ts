import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('getVisionProvider — provider selection', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('requires ANTHROPIC_API_KEY', async () => {
    const { getVisionProvider } = await import('../index');
    expect(() => getVisionProvider()).toThrow('ANTHROPIC_API_KEY');
  });

  it('returns a ClaudeVisionProvider once the key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { getVisionProvider } = await import('../index');
    const { ClaudeVisionProvider } = await import('../claude-vision-provider');
    expect(getVisionProvider()).toBeInstanceOf(ClaudeVisionProvider);
  });
});
