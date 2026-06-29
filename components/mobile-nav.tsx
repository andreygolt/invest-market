'use client';

import { useState } from 'react';

import { NavLink } from '@/components/nav-link';

export interface MobileNavItem {
  href: string;
  label: string;
  exact?: boolean;
}

interface MobileNavProps {
  items: MobileNavItem[];
}

export function MobileNav({ items }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {open && (
        <nav
          onClick={() => setOpen(false)}
          className="absolute left-0 right-0 top-full z-50 -mx-4 border-b border-slate-200 bg-white px-4 pb-4 pt-2 shadow-sm"
          aria-label="Мобильное меню"
        >
          <div className="flex flex-col gap-0.5">
            {items.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                exact={item.exact}
                className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                activeClassName="!bg-slate-100 !text-slate-900 font-medium"
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
