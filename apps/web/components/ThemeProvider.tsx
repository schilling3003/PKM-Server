'use client';

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  useEffect,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  resolvedTheme: 'light' | 'dark';
}

const STORAGE_KEY = 'pkm-theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
  } catch {
    return 'system';
  }
}

function setStoredTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

const themeStore = (() => {
  const listeners = new Set<() => void>();

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function handleStorage(e: StorageEvent) {
    if (e.key === STORAGE_KEY) notify();
  }

  return {
    get: getStoredTheme,
    set(theme: Theme) {
      setStoredTheme(theme);
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== 'undefined') {
        window.addEventListener('storage', handleStorage);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') {
          window.removeEventListener('storage', handleStorage);
        }
      };
    },
  };
})();

const systemStore = (() => {
  function subscribe(listener: () => void) {
    if (typeof window === 'undefined') return () => {};
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }

  return { get: getSystemTheme, subscribe };
})();

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<Theme>(
    themeStore.subscribe,
    themeStore.get,
    () => 'system'
  );
  const systemTheme = useSyncExternalStore<'light' | 'dark'>(
    systemStore.subscribe,
    systemStore.get,
    () => 'light'
  );
  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    themeStore.set(next);
  }, []);

  const toggleTheme = useCallback(() => {
    let next: Theme;
    if (theme === 'dark') {
      next = 'light';
    } else if (theme === 'light') {
      next = 'dark';
    } else {
      next = resolvedTheme === 'dark' ? 'light' : 'dark';
    }
    themeStore.set(next);
  }, [theme, resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
