"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Theme = "premium" | "arcade90s";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default theme is now "arcade90s" (WarCat Mode 90). "premium" is the secondary mode.
  const [theme, setTheme] = useState<Theme>("arcade90s");

  useEffect(() => {
    // Load from local storage
    const saved = localStorage.getItem("app-theme") as Theme;
    // If a saved theme exists and is valid, use it. 
    // Otherwise, fallback to the new default "arcade90s".
    if (saved && (saved === "premium" || saved === "arcade90s")) {
      setTheme(saved);
    } else {
      setTheme("arcade90s");
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
