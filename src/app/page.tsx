import { redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth/session';

export default async function RootPage() {
  const userId = await getSessionUserId();
  redirect(userId ? '/inbox' : '/login');
}
