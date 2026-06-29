'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function MarkAllReadButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await fetch('/api/notifications/read-all', { method: 'POST' });
    router.refresh();
    setLoading(false);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={loading}>
      {loading ? 'Обновление...' : 'Отметить все прочитанными'}
    </Button>
  );
}
