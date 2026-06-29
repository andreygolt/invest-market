import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';

type ButtonVariant = 'default' | 'destructive' | 'ghost' | 'outline';
type ButtonSize = 'default' | 'sm' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-black text-white hover:bg-gray-800',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'bg-transparent text-gray-900 hover:bg-gray-100',
  outline: 'border border-gray-300 bg-white text-gray-900 hover:bg-gray-100',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 px-3',
  lg: 'h-11 px-8',
};

const baseClasses =
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  children: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

type LinkChildProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function Button({
  asChild = false,
  children,
  className = '',
  size = 'default',
  variant = 'default',
  ...props
}: ButtonProps) {
  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  if (asChild) {
    const child = children as ReactElement<LinkChildProps>;
    return (
      <Link {...child.props} className={`${classes} ${child.props.className ?? ''}`}>
        {child.props.children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
