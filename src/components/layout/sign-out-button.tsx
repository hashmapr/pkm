'use client';

import { useRouter } from 'next/navigation';

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button onClick={handleSignOut} className="underline hover:text-gray-900 dark:hover:text-white">
      Sign out
    </button>
  );
}
