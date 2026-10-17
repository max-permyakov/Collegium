import type { ReactNode, KeyboardEvent } from 'react';
import { createContext, useContext, useState } from 'react';

interface TabsContextType {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

interface TabsProps {
  children: ReactNode;
  defaultValue: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function Tabs({ children, defaultValue, onValueChange, className = '' }: TabsProps) {
  const [value, setValue] = useState(defaultValue);

  const handleValueChange = (newValue: string) => {
    setValue(newValue);
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
}

export function TabsList({ children, className = '' }: TabsListProps) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`inline-flex items-center bg-dark-bg border border-dark-border rounded-xl p-1 ${className}`}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function TabsTrigger({ value, children, className = '', disabled = false }: TabsTriggerProps) {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('TabsTrigger must be used within Tabs');
  }

  const { value: currentValue, onValueChange } = context;
  const isActive = currentValue === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-disabled={disabled}
      data-state={isActive ? 'active' : 'inactive'}
      data-disabled={disabled}
      onClick={() => !disabled && onValueChange(value)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          !disabled && onValueChange(value);
        }
      }}
      className={`
        inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-bg disabled:pointer-events disabled:opacity-50
        ${isActive
          ? 'bg-primary-500 text-white shadow-sm'
          : 'text-dark-textMuted hover:bg-dark-border hover:text-dark-text'}
        ${className}
      `}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className = '' }: TabsContentProps) {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('TabsContent must be used within Tabs');
  }

  const { value: currentValue } = context;
  const isActive = currentValue === value;

  if (!isActive) return null;

  return (
    <div
      role="tabpanel"
      className={`mt-4 animate-in fade-in-0 zoom-in-95 duration-200 ${className}`}
    >
      {children}
    </div>
  );
}