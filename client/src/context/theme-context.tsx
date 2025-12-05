"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Theme = "premium" | "arcade90s";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("premium");

  useEffect(() => {
    // Optional: Load from local storage if desired
    const saved = localStorage.getItem("app-theme") as Theme;
    if (saved && (saved === "premium" || saved === "arcade90s")) {
      setTheme(saved);
    }
  }, []);

  const updateTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem("app-theme", t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: updateTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
