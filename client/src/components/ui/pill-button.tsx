"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "gold" | "dark" | "light";
  size?: "md" | "lg";
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const PillButton = React.forwardRef<HTMLButtonElement, PillButtonProps>(
  ({ className, variant = "gold", size = "md", icon, children, ...props }, ref) => {
    
    const variantStyles = {
      gold: "bg-image-pill-gold text-[#6b3b05] shadow-pill-gold border-none hover:brightness-110 active:scale-95",
      dark: "bg-image-pill-dark text-brand-text shadow-pill-dark border border-white/10 hover:brightness-125 active:scale-95",
      light: "bg-image-pill-light text-slate-700 shadow-md border border-white/40 hover:brightness-95 active:scale-95",
    };

    const sizeStyles = {
      md: "px-4 py-2 text-sm gap-3",
      lg: "px-6 py-3 text-base gap-4",
    };

    // Arcade Overrides
    // We check context or just use CSS classes passed in, but ideally we'd consume context here. 
    // For now, we'll rely on the parent passing arcade-specific classes or we can use a data-attribute if needed.
    // Actually, let's just make the base button support a 'retro' feel if a class is present.
    
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-between rounded-full transition-all select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
          "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]", // Default physics
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        <span className={cn(
          "flex items-center justify-center rounded-full shadow-inner shrink-0",
          size === "md" ? "w-6 h-6" : "w-8 h-8",
          variant === "gold" 
            ? "bg-white/20 text-[#6b3b05]" 
            : variant === "dark"
              ? "bg-brand-gold text-[#6b3b05] shadow-[0_0_10px_rgba(245,197,80,0.3)]"
              : "bg-slate-200 text-slate-600"
        )}>
          {icon || <ArrowRight className={size === "md" ? "w-3 h-3" : "w-4 h-4"} strokeWidth={3} />}
        </span>
        <span className="flex-1 text-center font-semibold tracking-wide whitespace-nowrap">
          {children}
        </span>
      </button>
    );
  }
);
PillButton.displayName = "PillButton";

export { PillButton };
