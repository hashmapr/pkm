import { notFound, redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth/session';
import { getSavedItem } from '@/lib/services/saved-items';
import { SavedItemForm } from '@/components/saved-items/item-form';
import type { SavedItemDto } from '@/types/saved-item';

interface EditItemPageProps {
  params: { id: string };
}

export default async function EditItemPage({ params }: EditItemPageProps) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const item = await getSavedItem(userId, params.id);
  if (!item) notFound();

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold">Edit item</h1>
      <div className="mt-6">
        <SavedItemForm item={JSON.parse(JSON.stringify(item)) as SavedItemDto} />
      </div>
    </div>
  );
}
