import { AppLayout } from "@/components/app-layout";
import { getLoads, Load } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Copy, Search, Filter, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/theme-context";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function AppLoads() {
  const [, setLocation] = useLocation();
  const { theme } = useTheme();
  const loads = getLoads(); // In real app this would be useQuery

  const copyLink = (e: React.MouseEvent, link: string | null | undefined) => {
    e.stopPropagation();
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast.success("Tracking link copied");
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className={cn("text-2xl font-bold", theme === "arcade90s" ? "arcade-title arcade-pixel-font" : "text-white")}>
              Loads
            </h1>
            <p className={cn("text-sm mt-1", theme === "arcade90s" ? "text-arc-muted font-mono text-xs" : "text-brand-muted")}>
              Manage shipments and tracking
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className={cn(theme === "arcade90s" ? "border-arc-border text-arc-muted bg-arc-bg rounded-none hover:text-arc-text" : "border-brand-border bg-brand-card text-brand-muted hover:text-white")}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
            <Button 
              onClick={() => setLocation("/app/loads/new")}
              className={cn(theme === "arcade90s" ? "bg-arc-primary text-black rounded-none border border-arc-primary shadow-arc-glow-yellow hover:bg-arc-primary/90 arcade-pixel-font text-xs font-bold" : "bg-brand-gold text-black hover:bg-brand-gold/90")}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Load
            </Button>
          </div>
        </div>

        {/* Table / List */}
        <div className={cn("overflow-hidden relative", 
          theme === "arcade90s" ? "border-2 border-arc-border arcade-panel rounded-none arcade-scanline" : "border border-brand-border rounded-xl bg-brand-card shadow-lg"
        )}>
          {theme === "arcade90s" && <div className="absolute top-0 left-0 w-full h-1 bg-arc-secondary/50 shadow-[0_0_15px_rgba(34,211,238,0.8)] z-20 pointer-events-none animate-[scanline_3s_linear_infinite] opacity-20" />}
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className={cn(
                "text-xs uppercase tracking-wider font-medium border-b",
                theme === "arcade90s" ? "bg-arc-bg text-arc-muted border-arc-border arcade-pixel-font" : "bg-brand-dark-pill text-brand-muted border-brand-border"
              )}>
                <tr>
                  <th className="px-6 py-4">Load #</th>
                  <th className="px-6 py-4">Broker / Shipper</th>
                  <th className="px-6 py-4">Origin & Destination</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Driver</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/50">
                {loads.map((load) => (
                  <tr 
                    key={load.id}
                    onClick={() => setLocation(`/app/loads/${load.id}`)}
                    className={cn(
                      "group cursor-pointer transition-colors relative",
                      theme === "arcade90s" ? "hover:bg-arc-secondary/10 border-arc-border hover:shadow-[inset_0_0_10px_rgba(34,211,238,0.1)]" : "hover:bg-brand-border/30 border-brand-border/50"
                    )}
                  >
                    <td className="px-6 py-4 font-mono font-medium whitespace-nowrap">
                      <span className={cn(theme === "arcade90s" ? "text-arc-secondary group-hover:arcade-flicker" : "text-white")}>
                        {load.externalLoadId}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn("font-medium", theme === "arcade90s" ? "text-arc-text" : "text-white")}>{load.brokerName}</div>
                      <div className={cn("text-xs mt-0.5", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>{load.shipperName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-1.5 h-1.5 rounded-full", theme === "arcade90s" ? "bg-arc-primary" : "bg-emerald-500")} />
                          <span className={theme === "arcade90s" ? "text-arc-text" : "text-brand-text"}>{load.stops[0].city}, {load.stops[0].state}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-1.5 h-1.5 rounded-full", theme === "arcade90s" ? "bg-arc-secondary" : "bg-brand-gold")} />
                          <span className={theme === "arcade90s" ? "text-arc-text" : "text-brand-text"}>{load.stops[load.stops.length-1].city}, {load.stops[load.stops.length-1].state}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border",
                        theme === "arcade90s"
                          ? "bg-arc-bg border-arc-secondary text-arc-secondary shadow-[0_0_5px_rgba(34,211,238,0.3)] rounded-none arcade-pixel-font"
                          : load.status === "IN_TRANSIT"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : "bg-brand-dark-pill border-brand-border text-brand-muted"
                      )}>
                        {load.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {load.driver ? (
                        <div className="flex items-center gap-2">
                          <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                            theme === "arcade90s" ? "bg-arc-purple text-white rounded-none" : "bg-brand-gold text-black"
                          )}>
                            {load.driver.name.charAt(0)}
                          </div>
                          <span className={cn("text-sm", theme === "arcade90s" ? "text-arc-text" : "text-brand-text")}>{load.driver.name}</span>
                        </div>
                      ) : (
                        <span className={cn("text-xs italic", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn("h-8 w-8", theme === "arcade90s" ? "text-arc-muted hover:text-arc-secondary hover:bg-arc-secondary/10" : "text-brand-muted hover:text-white hover:bg-brand-border")}
                        onClick={(e) => copyLink(e, load.customerTrackingLink)}
                        title="Copy Tracking Link"
                        disabled={!load.customerTrackingLink}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
