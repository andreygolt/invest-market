'use client';

import {
  Children,
  createContext,
  isValidElement,
  useContext,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const SelectContext = createContext<SelectContextValue | null>(null);

interface SelectProps {
  children: ReactNode;
  onValueChange: (value: string) => void;
  value: string;
}

export function Select({ children, onValueChange, value }: SelectProps) {
  return (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <div>{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className = '', children }: HTMLAttributes<HTMLDivElement>) {
  const context = useContext(SelectContext);
  const options = collectOptions(children);

  return (
    <select
      className={`h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ${className}`}
      value={context?.value ?? ''}
      onChange={(event) => context?.onValueChange(event.target.value)}
    >
      {options}
    </select>
  );
}

interface SelectValueProps extends HTMLAttributes<HTMLSpanElement> {
  placeholder?: string;
}

export function SelectValue(props: SelectValueProps) {
  void props;
  return null;
}

export function SelectContent({ children }: HTMLAttributes<HTMLDivElement>) {
  return <>{children}</>;
}

interface SelectItemProps extends SelectHTMLAttributes<HTMLOptionElement> {
  value: string;
}

export function SelectItem({ children, value }: SelectItemProps) {
  return <option value={value}>{children}</option>;
}

function collectOptions(children: ReactNode): ReactElement[] {
  const options: ReactElement[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    if (child.type === SelectItem) {
      options.push(child as ReactElement);
      return;
    }
    options.push(...collectOptions(child.props.children));
  });

  return options;
}
