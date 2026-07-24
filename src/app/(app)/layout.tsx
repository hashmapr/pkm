import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { SignOutButton } from '@/components/layout/sign-out-button';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
      <header className="border-b border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/inbox" className="text-lg font-semibold tracking-tight">
              PKM
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/inbox" className="text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white">
                Inbox
              </Link>
              <Link href="/projects" className="text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white">
                Projects
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-neutral-400">
            <span>{user.name ?? user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
