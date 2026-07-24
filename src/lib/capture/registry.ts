import { NoCaptureProviderError } from './errors';
import type { CaptureInput, CaptureProvider, CaptureResult } from './types';

export class CaptureProviderRegistry {
  private readonly providers: CaptureProvider[] = [];

  /** Order matters: registered first = tried first. Register more specific providers (URL-pattern matchers) before general fallbacks. */
  register(provider: CaptureProvider): void {
    this.providers.push(provider);
  }

  findProvider(input: CaptureInput): CaptureProvider | undefined {
    return this.providers.find((p) => p.supports(input));
  }

  async capture(input: CaptureInput): Promise<CaptureResult> {
    const provider = this.findProvider(input);
    if (!provider) throw new NoCaptureProviderError();
    return provider.capture(input);
  }
}
