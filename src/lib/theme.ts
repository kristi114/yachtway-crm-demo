import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "yw-theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  // Read stored preference / system default on mount (avoids SSR mismatch).
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? null;
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const initial: Theme = stored ?? (prefersDark ? "dark" : "light");
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable - ignore */
    }
  };

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");
  return { theme, setTheme, toggle };
}
