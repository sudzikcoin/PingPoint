import { useState } from "react";
import { useLocation } from "wouter";
import { getLoadsByView } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Truck, ChevronRight, Navigation, Calendar, MapPin } from "lucide-react";
import { format } from "date-fns";
import { PillButton } from "@/components/ui/pill-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";

export default function DriverDashboard() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"today" | "upcoming" | "history">("today");
  const { theme } = useTheme();

  const loads = getLoadsByView(activeTab);

  return (
    <div className={cn("min-h-screen pb-20 font-sans transition-colors duration-300", 
      theme === "arcade90s" ? "arcade-bg text-arc-text" : "bg-brand-bg text-brand-text"
    )}>
      {/* Header */}
      <header className="w-full mb-4">
        <div
          className={cn(
            "flex items-center justify-between px-4 py-3 rounded-b-2xl border-b transition-all duration-300",
            theme === "arcade90s" 
              ? "bg-arc-panel border-arc-secondary/30 shadow-[0_0_15px_rgba(34,211,238,0.15)]" 
              : "bg-brand-bg border-brand-border/70"
          )}
        >
          <h1 className={cn(
            "text-center flex-1 ml-8", // ml-8 to balance the toggle on right
            theme === "arcade90s"
              ? "arcade-pixel-font arcade-title text-lg tracking-widest"
              : "text-sm sm:text-base md:text-lg font-semibold tracking-[0.25em] uppercase text-brand-text/80"
          )}>
            {theme === "arcade90s" ? (
              <>
                PINGPOINT <span className="arcade-subtitle text-[0.6em] block sm:inline sm:ml-2">PRESS START</span>
              </>
            ) : (
              <>
                <span className="text-brand-text">PingPoint</span>
                <span className="ml-2 text-[0.65em] font-medium text-brand-muted">by SuVerse labs</span>
              </>
            )}
          </h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Status Tabs */}
        <Tabs defaultValue="today" onValueChange={(v) => setActiveTab(v as any)} className="w-full mt-4">
          <TabsList className={cn(
            "grid w-full grid-cols-3 p-1 rounded-full border transition-all duration-300",
            theme === "arcade90s" 
              ? "bg-arc-panel border-arc-border shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]" 
              : "bg-brand-card border-brand-border"
          )}>
            {["today", "upcoming", "history"].map((tab) => (
              <TabsTrigger 
                key={tab}
                value={tab} 
                className={cn(
                  "rounded-full text-xs font-medium capitalize transition-all duration-300",
                  theme === "arcade90s"
                    ? "data-[state=active]:bg-arc-secondary data-[state=active]:text-black data-[state=active]:shadow-arc-glow-cyan data-[state=active]:font-bold arcade-pixel-font text-[10px] tracking-widest text-arc-muted"
                    : "data-[state=active]:bg-brand-gold data-[state=active]:text-[#6b3b05] data-[state=active]:shadow-md"
                )}
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-6 space-y-4">
            {loads.length === 0 ? (
              <div className="text-center py-12">
                <div className={cn(
                  "mx-auto h-16 w-16 rounded-full flex items-center justify-center mb-4 transition-all duration-300",
                  theme === "arcade90s"
                    ? "bg-arc-panel border border-arc-secondary/30 shadow-arc-glow-cyan"
                    : "bg-brand-card border border-brand-border shadow-pill-dark"
                )}>
                  <Truck className={cn("h-8 w-8 transition-colors", 
                    theme === "arcade90s" ? "text-arc-secondary animate-pulse" : "text-brand-muted"
                  )} />
                </div>
                <h3 className={cn("text-lg font-medium", theme === "arcade90s" ? "arcade-title tracking-wider" : "text-brand-text")}>
                  {theme === "arcade90s" ? "NO MISSIONS DETECTED" : "No loads found"}
                </h3>
                <p className={cn("text-sm mt-1", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font text-[10px]" : "text-brand-muted")}>
                  You have no loads in this category.
                </p>
              </div>
            ) : (
              loads.map((load) => (
                <Card 
                  key={load.id} 
                  className={cn(
                    "overflow-hidden transition-all duration-300 cursor-pointer group",
                    theme === "arcade90s"
                      ? "arcade-panel rounded-none border-2 border-arc-border hover:border-arc-secondary hover:shadow-arc-glow-cyan hover:scale-[1.01]"
                      : "border-brand-border bg-brand-card shadow-lg shadow-black/20 rounded-2xl hover:border-brand-gold/30"
                  )}
                  onClick={() => setLocation(`/driver/loads/${load.id}`)}
                >
                  <CardHeader className="p-5 pb-3 flex flex-row items-start justify-between space-y-0">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase shadow-sm transition-all",
                          theme === "arcade90s"
                            ? "arcade-badge bg-transparent border-arc-secondary text-arc-secondary shadow-[0_0_5px_rgba(34,211,238,0.5)]"
                            : load.status === "IN_TRANSIT" 
                              ? "bg-gradient-to-r from-brand-gold-light via-brand-gold to-brand-gold-dark text-[#6b3b05]" 
                              : "bg-brand-dark-pill border border-brand-border text-brand-muted"
                        )}>
                          {load.status.replace("_", " ")}
                        </div>
                        <span className={cn(
                          "text-xs font-mono tracking-wider transition-colors",
                          theme === "arcade90s" ? "text-arc-primary arcade-pixel-font text-[10px]" : "text-brand-muted"
                        )}>{load.externalLoadId}</span>
                      </div>
                      <CardTitle className={cn(
                        "text-base font-bold leading-tight transition-colors",
                        theme === "arcade90s" 
                          ? "text-arc-text group-hover:text-arc-secondary arcade-pixel-font tracking-wide" 
                          : "text-white group-hover:text-brand-gold"
                      )}>
                        {load.brokerName}
                      </CardTitle>
                    </div>
                    <div className={cn(
                      "h-8 w-8 flex items-center justify-center transition-all duration-300",
                      theme === "arcade90s"
                        ? "text-arc-secondary group-hover:animate-ping"
                        : "rounded-full bg-brand-dark-pill border border-brand-border group-hover:bg-brand-gold group-hover:text-[#6b3b05]"
                    )}>
                       <ChevronRight className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 pt-2 space-y-5">
                    {/* Route Visualization */}
                    <div className={cn(
                      "relative pl-4 border-l space-y-6 my-2 ml-2 transition-colors",
                      theme === "arcade90s" ? "border-arc-border" : "border-brand-border"
                    )}>
                      {load.stops.map((stop, idx) => (
                        <div key={stop.id} className="relative">
                          <div className={cn(
                            "absolute -left-[21px] top-1 h-3 w-3 rounded-full shadow-md transition-all",
                            theme === "arcade90s"
                              ? idx === 0 
                                ? "bg-arc-secondary shadow-arc-glow-cyan rounded-none rotate-45" // Diamond for start
                                : idx === load.stops.length - 1 
                                  ? "bg-arc-primary shadow-arc-glow-yellow rounded-none" // Square for end
                                  : "bg-arc-purple rounded-full"
                              : idx === 0 
                                ? "bg-emerald-500 ring-4 ring-brand-card" 
                                : idx === load.stops.length - 1 
                                  ? "bg-brand-gold ring-4 ring-brand-card" 
                                  : "bg-brand-border ring-4 ring-brand-card"
                          )} />
                          <div className="space-y-1">
                            <div className="flex items-baseline justify-between">
                              <p className={cn(
                                "text-sm font-semibold transition-colors",
                                theme === "arcade90s" ? "text-arc-text arcade-pixel-font text-[10px] tracking-wide" : "text-brand-text"
                              )}>{stop.city}, {stop.state}</p>
                            </div>
                            <div className={cn(
                              "flex items-center gap-2 text-xs transition-colors",
                              theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted"
                            )}>
                              <Calendar className="h-3 w-3" />
                              <span>{format(new Date(stop.windowStart), "MMM d, h:mm a")}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {load.lastLocationCity && (
                      <div className={cn(
                        "flex items-center gap-3 text-xs p-3 transition-all",
                        theme === "arcade90s"
                          ? "text-arc-primary border border-arc-primary/30 bg-arc-primary/5 arcade-pixel-font text-[10px] tracking-wider"
                          : "text-brand-gold bg-brand-gold/5 rounded-xl border border-brand-gold/10"
                      )}>
                        <Navigation className="h-3.5 w-3.5" />
                        <span className="font-medium tracking-wide">Last ping: {load.lastLocationCity}, {load.lastLocationState}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </Tabs>
      </main>
    </div>
  );
}
