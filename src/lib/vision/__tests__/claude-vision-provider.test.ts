import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VisionProviderError, VisionResponseValidationError } from '../errors';

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = { create: createMock };
    constructor(public options: { apiKey?: string }) {}
  },
}));

describe('ClaudeVisionProvider', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('sends the image as a base64 content block alongside the prompt text', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ description: 'A cat on a chair', extractedText: '' }) }],
    });
    const { ClaudeVisionProvider } = await import('../claude-vision-provider');
    const provider = new ClaudeVisionProvider({ apiKey: 'test-key' });

    const result = await provider.describeImage({
      buffer: Buffer.from('fake-image-bytes'),
      mimeType: 'image/png',
      kind: 'IMAGE',
    });

    expect(result.description).toBe('A cat on a chair');
    expect(result.extractedText).toBe('');
    const call = createMock.mock.calls[0][0];
    const content = call.messages[0].content;
    expect(content[0].type).toBe('image');
    expect(content[0].source.media_type).toBe('image/png');
    expect(content[0].source.data).toBe(Buffer.from('fake-image-bytes').toString('base64'));
    expect(content[1].type).toBe('text');
  });

  it('uses a screenshot-specific prompt when kind is SCREENSHOT', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ description: 'A code editor', extractedText: 'const x = 1;' }) }],
    });
    const { ClaudeVisionProvider } = await import('../claude-vision-provider');
    const provider = new ClaudeVisionProvider({ apiKey: 'test-key' });

    const result = await provider.describeImage({
      buffer: Buffer.from('fake'),
      mimeType: 'image/png',
      kind: 'SCREENSHOT',
    });

    expect(result.extractedText).toBe('const x = 1;');
    const call = createMock.mock.calls[0][0];
    expect(call.messages[0].content[1].text).toMatch(/screenshot/i);
  });

  it('rejects an unsupported image mime type before calling the model', async () => {
    const { ClaudeVisionProvider } = await import('../claude-vision-provider');
    const provider = new ClaudeVisionProvider({ apiKey: 'test-key' });

    await expect(
      provider.describeImage({ buffer: Buffer.from('x'), mimeType: 'image/tiff', kind: 'IMAGE' }),
    ).rejects.toThrow(VisionProviderError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('throws VisionProviderError when the response has no text content', async () => {
    createMock.mockResolvedValue({ content: [] });
    const { ClaudeVisionProvider } = await import('../claude-vision-provider');
    const provider = new ClaudeVisionProvider({ apiKey: 'test-key' });

    await expect(
      provider.describeImage({ buffer: Buffer.from('x'), mimeType: 'image/png', kind: 'IMAGE' }),
    ).rejects.toThrow(VisionProviderError);
  });

  it('throws VisionProviderError when the underlying request fails', async () => {
    createMock.mockRejectedValue(new Error('rate limited'));
    const { ClaudeVisionProvider } = await import('../claude-vision-provider');
    const provider = new ClaudeVisionProvider({ apiKey: 'test-key' });

    await expect(
      provider.describeImage({ buffer: Buffer.from('x'), mimeType: 'image/png', kind: 'IMAGE' }),
    ).rejects.toThrow(VisionProviderError);
  });

  it('throws VisionResponseValidationError on malformed JSON', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] });
    const { ClaudeVisionProvider } = await import('../claude-vision-provider');
    const provider = new ClaudeVisionProvider({ apiKey: 'test-key' });

    await expect(
      provider.describeImage({ buffer: Buffer.from('x'), mimeType: 'image/png', kind: 'IMAGE' }),
    ).rejects.toThrow(VisionResponseValidationError);
  });

  it('defaults extractedText to empty string when omitted', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ description: 'A dog' }) }] });
    const { ClaudeVisionProvider } = await import('../claude-vision-provider');
    const provider = new ClaudeVisionProvider({ apiKey: 'test-key' });

    const result = await provider.describeImage({ buffer: Buffer.from('x'), mimeType: 'image/png', kind: 'IMAGE' });
    expect(result.extractedText).toBe('');
  });
});
