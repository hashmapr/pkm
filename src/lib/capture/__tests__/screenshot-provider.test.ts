import { describe, expect, it } from 'vitest';
import { CaptureProviderError } from '../errors';
import { ScreenshotCaptureProvider } from '../providers/screenshot-provider';
import { VisionProviderError } from '@/lib/vision/errors';
import type { VisionProvider } from '@/lib/vision/types';

function fakeVision(describeImage: VisionProvider['describeImage']): VisionProvider {
  return { describeImage };
}

const file = { buffer: Buffer.from('fake-bytes'), filename: 'screenshot.png', mimeType: 'image/png' };

describe('ScreenshotCaptureProvider', () => {
  it('only supports an image file with the SCREENSHOT hint', () => {
    const provider = new ScreenshotCaptureProvider(fakeVision(async () => ({ description: '', extractedText: '' })));
    expect(provider.supports({ file, hint: 'SCREENSHOT' })).toBe(true);
    expect(provider.supports({ file })).toBe(false);
    expect(provider.supports({ file, hint: 'IMAGE' })).toBe(false);
  });

  it('passes kind SCREENSHOT to the vision provider', async () => {
    let receivedKind: string | undefined;
    const provider = new ScreenshotCaptureProvider(
      fakeVision(async (input) => {
        receivedKind = input.kind;
        return { description: 'A terminal window', extractedText: '$ npm test' };
      }),
    );

    const captured = await provider.capture({ file, hint: 'SCREENSHOT' });

    expect(receivedKind).toBe('SCREENSHOT');
    expect(captured.type).toBe('SCREENSHOT');
    expect(captured.content).toBe('A terminal window\n\nText in screenshot:\n$ npm test');
  });

  it('wraps a VisionProviderError in CaptureProviderError', async () => {
    const provider = new ScreenshotCaptureProvider(
      fakeVision(async () => {
        throw new VisionProviderError('Claude vision API request failed');
      }),
    );
    await expect(provider.capture({ file, hint: 'SCREENSHOT' })).rejects.toThrow(CaptureProviderError);
  });

  it('honors an explicit title override', async () => {
    const provider = new ScreenshotCaptureProvider(
      fakeVision(async () => ({ description: 'A settings page.', extractedText: '' })),
    );
    const captured = await provider.capture({ file, hint: 'SCREENSHOT', title: 'Settings' });
    expect(captured.title).toBe('Settings');
  });
});
