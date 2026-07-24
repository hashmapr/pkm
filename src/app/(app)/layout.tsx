import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/session';
import { SignOutButton } from '@/components/layout/sign-out-button';
import { SearchBar } from '@/components/search/search-bar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
      <header className="border-b border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/inbox" className="shrink-0 text-lg font-semibold tracking-tight">
            PKM
          </Link>
          <nav className="flex shrink-0 gap-4 text-sm">
            <Link href="/inbox" className="text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white">
              Inbox
            </Link>
            <Link href="/search" className="text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white">
              Search
            </Link>
            <Link href="/projects" className="text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white">
              Projects
            </Link>
            <Link href="/chat" className="text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white">
              Assistant
            </Link>
          </nav>
          <Suspense>
            <SearchBar />
          </Suspense>
          <div className="ml-auto flex shrink-0 items-center gap-3 text-sm text-gray-600 dark:text-neutral-400">
            <span>{user.name ?? user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
