import { SavedItemForm } from '@/components/saved-items/item-form';

export default function NewItemPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold">Save a new item</h1>
      <div className="mt-6">
        <SavedItemForm />
      </div>
    </div>
  );
}
