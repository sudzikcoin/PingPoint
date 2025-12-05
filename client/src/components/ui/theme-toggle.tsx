"use client";

import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn("flex items-center gap-1 p-1 rounded-full border transition-colors",
      theme === "arcade90s" ? "bg-[#040816] border-[#22d3ee]" : "bg-brand-card border-brand-border"
    )}>
      <button
        onClick={() => setTheme("premium")}
        className={cn(
          "text-[10px] px-2 py-1 rounded-full transition-all font-medium",
          theme === "premium" 
            ? "bg-brand-gold text-[#6b3b05] shadow-sm" 
            : "text-brand-muted hover:text-brand-text"
        )}
      >
        Premium
      </button>
      <button
        onClick={() => setTheme("arcade90s")}
        className={cn(
          "text-[10px] px-2 py-1 rounded-full transition-all font-medium",
          theme === "arcade90s"
            ? "bg-[#facc15] text-black shadow-[0_0_10px_rgba(250,204,21,0.5)]"
            : "text-brand-muted hover:text-brand-text"
        )}
      >
        Arcade 90s
      </button>
    </div>
  );
}
