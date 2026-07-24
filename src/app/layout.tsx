import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PKM — Personal Knowledge Capture',
  description: 'Save anything. AI understands, organizes, and connects it.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
