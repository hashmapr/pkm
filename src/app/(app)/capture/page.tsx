import { CaptureForm } from '@/components/capture/capture-form';

export default function CapturePage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold">Capture</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
        Paste a link (a webpage, YouTube video, or GitHub repo all get handled automatically),
        write a note, or upload an image, screenshot, or PDF.
      </p>
      <div className="mt-6">
        <CaptureForm />
      </div>
    </div>
  );
}
