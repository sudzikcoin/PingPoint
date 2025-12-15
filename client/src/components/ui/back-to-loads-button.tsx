import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";

export function BackToLoadsButton() {
  const [, setLocation] = useLocation();
  const { theme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setLocation("/app/loads")}
      aria-label="Back to Loads"
      className={cn(
        "shrink-0 focus:ring-2 focus:ring-offset-2",
        theme === "arcade90s"
          ? "text-arc-secondary hover:bg-arc-secondary/10 rounded-none focus:ring-arc-secondary"
          : "text-brand-muted hover:text-white focus:ring-brand-gold"
      )}
    >
      <ArrowLeft className="w-5 h-5" />
    </Button>
  );
}
