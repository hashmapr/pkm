import { describe, expect, it } from 'vitest';
import { CaptureProviderError } from '../errors';
import { ImageCaptureProvider } from '../providers/image-provider';
import { VisionProviderError } from '@/lib/vision/errors';
import type { VisionProvider, VisionResult } from '@/lib/vision/types';

function fakeVision(describeImage: VisionProvider['describeImage']): VisionProvider {
  return { describeImage };
}

const file = { buffer: Buffer.from('fake-bytes'), filename: 'photo.png', mimeType: 'image/png' };

describe('ImageCaptureProvider', () => {
  it('supports any image file without a SCREENSHOT hint', () => {
    const provider = new ImageCaptureProvider(fakeVision(async () => ({ description: '', extractedText: '' })));
    expect(provider.supports({ file })).toBe(true);
    expect(provider.supports({ file, hint: 'IMAGE' })).toBe(true);
  });

  it('does not support a file with the SCREENSHOT hint', () => {
    const provider = new ImageCaptureProvider(fakeVision(async () => ({ description: '', extractedText: '' })));
    expect(provider.supports({ file, hint: 'SCREENSHOT' })).toBe(false);
  });

  it('does not support non-image files or missing files', () => {
    const provider = new ImageCaptureProvider(fakeVision(async () => ({ description: '', extractedText: '' })));
    expect(provider.supports({ file: { ...file, mimeType: 'application/pdf' } })).toBe(false);
    expect(provider.supports({ text: 'no file' })).toBe(false);
  });

  it('builds content from description and extracted text, and derives a title', async () => {
    const result: VisionResult = { description: 'A golden retriever sitting in a park. Sunny day.', extractedText: 'PARK RULES' };
    const provider = new ImageCaptureProvider(fakeVision(async () => result));

    const captured = await provider.capture({ file });

    expect(captured.type).toBe('IMAGE');
    expect(captured.title).toBe('A golden retriever sitting in a park.');
    expect(captured.content).toBe('A golden retriever sitting in a park. Sunny day.\n\nText in image:\nPARK RULES');
    expect(captured.metadata).toEqual({ filename: 'photo.png', mimeType: 'image/png', extractedText: 'PARK RULES' });
  });

  it('omits the "Text in image" section when there is no extracted text', async () => {
    const provider = new ImageCaptureProvider(fakeVision(async () => ({ description: 'A sunset.', extractedText: '' })));
    const captured = await provider.capture({ file });
    expect(captured.content).toBe('A sunset.');
    expect(captured.metadata?.extractedText).toBeUndefined();
  });

  it('honors an explicit title override', async () => {
    const provider = new ImageCaptureProvider(fakeVision(async () => ({ description: 'A sunset.', extractedText: '' })));
    const captured = await provider.capture({ file, title: 'My Photo' });
    expect(captured.title).toBe('My Photo');
  });

  it('wraps a VisionProviderError in CaptureProviderError', async () => {
    const provider = new ImageCaptureProvider(
      fakeVision(async () => {
        throw new VisionProviderError('Claude vision API request failed');
      }),
    );
    await expect(provider.capture({ file })).rejects.toThrow(CaptureProviderError);
  });
});
