'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { MonitorIcon, MoonIcon, SunIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/shadcn/utils';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

export function ThemeToggle({ className, size = 'md' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const options = [
    {
      value: 'light',
      label: 'Light mode',
      icon: SunIcon,
    },
    {
      value: 'dark',
      label: 'Dark mode',
      icon: MoonIcon,
    },
    {
      value: 'system',
      label: 'System theme',
      icon: MonitorIcon,
    },
  ] as const;

  return (
    <div
      role="group"
      aria-label="Theme preference toggle"
      className={cn(
        'inline-flex items-center rounded-full border border-slate-200/80 bg-slate-100/80 p-1 shadow-xs backdrop-blur-md transition-colors dark:border-slate-800/80 dark:bg-slate-900/80',
        className
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        // Handle SSR gracefully: before mounting, don't show active state to prevent hydration mismatch
        const isActive = mounted && theme === opt.value;

        return (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={isActive}
            onClick={() => setTheme(opt.value)}
            className={cn(
              'relative flex items-center justify-center rounded-full transition-all duration-200 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1 text-xs font-semibold',
              isActive
                ? 'scale-105 bg-white font-bold text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-400'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            <Icon
              size={size === 'sm' ? 14 : 16}
              weight={isActive ? 'bold' : 'regular'}
              className="transition-transform duration-200"
            />
            <span className="sr-only">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
