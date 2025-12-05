import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Plus, Truck, Package, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/context/theme-context";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme } = useTheme();

  const navItems = [
    { name: "Loads", href: "/app/loads", icon: Package },
    { name: "Drivers", href: "/app/drivers", icon: Truck }, // Placeholder
  ];

  return (
    <div className={cn("min-h-screen flex font-sans transition-colors duration-300",
      theme === "arcade90s" ? "arcade-bg text-arc-text" : "bg-brand-bg text-brand-text"
    )}>
      {/* Sidebar */}
      <aside className={cn("hidden md:flex w-64 flex-col border-r transition-colors",
        theme === "arcade90s" ? "bg-arc-panel border-arc-border" : "bg-brand-card border-brand-border"
      )}>
        <div className="p-6 border-b border-brand-border/10">
          <div className={cn("text-xs font-bold tracking-[0.2em] uppercase", 
            theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-muted"
          )}>
            PingPoint Control
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link key={item.name} href={item.href}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer group",
                  isActive 
                    ? theme === "arcade90s" 
                      ? "bg-arc-secondary/20 text-arc-secondary shadow-arc-glow-cyan border border-arc-secondary/50" 
                      : "bg-brand-dark-pill text-white border border-brand-border shadow-sm"
                    : theme === "arcade90s"
                      ? "text-arc-muted hover:text-arc-text hover:bg-arc-bg"
                      : "text-brand-muted hover:text-white hover:bg-brand-dark-pill/50"
                )}>
                  <item.icon className={cn("w-4 h-4", 
                    isActive && theme === "arcade90s" && "text-arc-secondary",
                    isActive && theme !== "arcade90s" && "text-brand-gold"
                  )} />
                  <span className={cn(theme === "arcade90s" && "arcade-pixel-font text-xs tracking-wide")}>{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-brand-border/10 space-y-4">
          <div className="flex items-center justify-between">
             <ThemeToggle />
          </div>
          <div className={cn("text-[10px] text-center", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted/50")}>
            v1.0.0 • AgentOS
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
