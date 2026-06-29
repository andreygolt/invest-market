'use client';

import {
  createContext,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useState,
} from 'react';

type PopoverContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

export function Popover({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({
  className = '',
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = useContext(PopoverContext);

  if (!context) {
    throw new Error('PopoverTrigger must be used within Popover');
  }

  return (
    <button
      className={className}
      onClick={(event) => {
        context.setOpen(!context.open);
        onClick?.(event);
      }}
      type="button"
      {...props}
    />
  );
}

export function PopoverContent({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  const context = useContext(PopoverContext);

  if (!context) {
    throw new Error('PopoverContent must be used within Popover');
  }

  if (!context.open) return null;

  return (
    <div
      className={`absolute right-0 z-50 mt-2 rounded-md border bg-white shadow-lg ${className}`}
      {...props}
    />
  );
}
