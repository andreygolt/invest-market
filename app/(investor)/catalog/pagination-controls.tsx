'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  page: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}

export default function PaginationControls({ page, totalPages, searchParams }: Props) {
  const pathname = usePathname();

  function buildHref(p: number) {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v && k !== 'page') params.set(k, v);
    });
    params.set('page', String(p));
    return `${pathname}?${params}`;
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      {page > 1 && (
        <Link
          href={buildHref(page - 1)}
          className="px-3 py-1 rounded border text-sm hover:bg-slate-50"
        >
          ← Назад
        </Link>
      )}

      <span className="text-sm text-slate-600">
        Страница {page} из {totalPages}
      </span>

      {page < totalPages && (
        <Link
          href={buildHref(page + 1)}
          className="px-3 py-1 rounded border text-sm hover:bg-slate-50"
        >
          Вперёд →
        </Link>
      )}
    </div>
  );
}
