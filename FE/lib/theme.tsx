'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'researchmind-theme';

/** Only the public landing page may use dark mode; every page after login is light-only. */
const DARK_MODE_ALLOWED_PATH = '/';

/** Inline script injected before hydration so the page never flashes the wrong theme. */
export const themeInitScript = `
(function () {
  try {
    if (window.location.pathname !== '${DARK_MODE_ALLOWED_PATH}') {
      document.documentElement.classList.remove('dark');
      return;
    }
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch (e) {}
})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    if (pathname !== DARK_MODE_ALLOWED_PATH) {
      document.documentElement.classList.remove('dark');
      setThemeState('light');
      return;
    }
    const isDark = document.documentElement.classList.contains('dark');
    setThemeState(isDark ? 'dark' : 'light');
  }, [pathname]);

  const applyTheme = (next: Theme) => {
    setThemeState(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  const toggleTheme = () => applyTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
