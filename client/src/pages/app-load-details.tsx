import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoadById, updateLoad } from "@/lib/mock-data";
import { useRoute, useLocation } from "wouter";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { ArrowLeft, Copy, ExternalLink, Truck, User, Phone, MapPin, Calendar } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export default function AppLoadDetails() {
  const [, params] = useRoute("/app/loads/:id");
  const [, setLocation] = useLocation();
  const { theme } = useTheme();
  const [load, setLoad] = useState(getLoadById(params?.id || ""));

  useEffect(() => {
    setLoad(getLoadById(params?.id || ""));
  }, [params?.id]);

  if (!load) return <div className="p-8 text-white">Load not found</div>;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleAssignDriver = () => {
    // Mock assignment
    const updated = updateLoad(load.id, {
      driver: {
        name: "Jane Smith",
        phone: "555-9999",
        truckNumber: "TRK-NEW",
        trailerNumber: "TLR-NEW"
      },
      driverTrackingLink: `https://pingpoint.app/driver/track/new-${Date.now()}`
    });
    if (updated) {
      setLoad(updated);
      toast.success("Driver assigned (Mock)");
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Bar */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation("/app/loads")}
            className={cn(theme === "arcade90s" ? "text-arc-secondary hover:bg-arc-secondary/10 rounded-none" : "text-brand-muted hover:text-white")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className={cn("text-2xl font-bold", theme === "arcade90s" ? "arcade-title arcade-pixel-font" : "text-white")}>
                {load.externalLoadId}
              </h1>
              <span className={cn(
                "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border",
                theme === "arcade90s"
                  ? "bg-arc-bg border-arc-secondary text-arc-secondary shadow-[0_0_5px_rgba(34,211,238,0.3)] rounded-none arcade-pixel-font"
                  : "bg-brand-dark-pill border-brand-border text-brand-muted"
              )}>
                {load.status}
              </span>
            </div>
            <div className="flex gap-2 mt-1 text-xs">
              <span className={cn("px-2 py-0.5 rounded border", theme === "arcade90s" ? "border-arc-border text-arc-muted bg-arc-bg" : "bg-brand-card border-brand-border text-brand-muted")}>
                {load.brokerName}
              </span>
              <span className={cn("px-2 py-0.5 rounded border", theme === "arcade90s" ? "border-arc-border text-arc-muted bg-arc-bg" : "bg-brand-card border-brand-border text-brand-muted")}>
                {load.shipperName}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Col: Route & Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Route Overview */}
            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader>
                <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>Route Plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {load.stops.map((stop, idx) => (
                  <div key={stop.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={cn("w-3 h-3 rounded-full", 
                        theme === "arcade90s" 
                          ? idx === 0 ? "bg-arc-primary" : "bg-arc-secondary"
                          : idx === 0 ? "bg-emerald-500" : "bg-brand-gold"
                      )} />
                      {idx < load.stops.length - 1 && (
                        <div className={cn("w-0.5 flex-1 my-1", theme === "arcade90s" ? "bg-arc-border" : "bg-brand-border")} />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className={cn("text-xs font-bold uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                            {stop.type} • {stop.name}
                          </p>
                          <p className={cn("text-base font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                            {stop.city}, {stop.state}
                          </p>
                          <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                            {stop.addressLine1}
                          </p>
                        </div>
                        <div className={cn("text-xs text-right", theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted")}>
                          <div className="flex items-center justify-end gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(stop.windowStart), "MMM d, HH:mm")}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Commercial Info */}
            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader>
                <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>Commercial Info</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div>
                  <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Rate</p>
                  <p className={cn("text-xl font-bold", theme === "arcade90s" ? "text-arc-secondary font-mono" : "text-brand-gold")}>
                    {load.rateAmount ? `$${load.rateAmount.toFixed(2)}` : "—"}
                  </p>
                </div>
                <div>
                  <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Customer Ref</p>
                  <p className={cn("text-sm font-mono", theme === "arcade90s" ? "text-arc-text" : "text-white")}>{load.customerReference || "—"}</p>
                </div>
                <div>
                  <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Internal Ref</p>
                  <p className={cn("text-sm font-mono", theme === "arcade90s" ? "text-arc-text" : "text-white")}>{load.internalReference || "—"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Col: Actions & Tracking */}
          <div className="space-y-6">
            {/* Driver Assignment */}
            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>Driver</CardTitle>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={handleAssignDriver}
                  className={cn("h-7 text-xs", theme === "arcade90s" ? "text-arc-secondary hover:text-arc-text" : "text-brand-gold hover:text-white")}
                >
                  Edit
                </Button>
              </CardHeader>
              <CardContent>
                {load.driver ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", theme === "arcade90s" ? "bg-arc-purple text-white rounded-none" : "bg-brand-dark-pill border border-brand-border")}>
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <p className={cn("font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")}>{load.driver.name}</p>
                        <p className={cn("text-xs flex items-center gap-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                          <Phone className="w-3 h-3" /> {load.driver.phone}
                        </p>
                      </div>
                    </div>
                    <div className={cn("grid grid-cols-2 gap-2 text-xs p-3 rounded", theme === "arcade90s" ? "bg-arc-bg border border-arc-border" : "bg-brand-dark-pill/50 border border-brand-border/50")}>
                      <div>
                        <span className="block text-brand-muted/70 text-[10px] uppercase">Truck</span>
                        <span className="font-mono">{load.driver.truckNumber}</span>
                      </div>
                      <div>
                        <span className="block text-brand-muted/70 text-[10px] uppercase">Trailer</span>
                        <span className="font-mono">{load.driver.trailerNumber}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className={cn("text-sm mb-3", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>No driver assigned</p>
                    <Button 
                      onClick={handleAssignDriver}
                      className={cn("w-full", theme === "arcade90s" ? "bg-arc-secondary text-black rounded-none shadow-arc-glow-cyan" : "bg-brand-dark-pill border border-brand-border")}
                    >
                      Assign Driver
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tracking Links */}
            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader>
                <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>Tracking Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className={cn("text-xs font-bold uppercase tracking-wide", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Customer Link</label>
                  {load.customerTrackingLink ? (
                    <div className="flex gap-2">
                      <div className={cn("flex-1 p-2 text-xs truncate rounded border", 
                        theme === "arcade90s" ? "bg-arc-bg border-arc-border text-arc-text font-mono" : "bg-brand-dark-pill border-brand-border text-brand-muted"
                      )}>
                        {load.customerTrackingLink}
                      </div>
                      <Button size="icon" variant="outline" onClick={() => copyToClipboard(load.customerTrackingLink!)} className={theme === "arcade90s" ? "rounded-none border-arc-border" : ""}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full">Generate Link</Button>
                  )}
                </div>

                <div className="space-y-2">
                  <label className={cn("text-xs font-bold uppercase tracking-wide", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Driver App Link</label>
                  {load.driverTrackingLink ? (
                    <div className="flex gap-2">
                      <div className={cn("flex-1 p-2 text-xs truncate rounded border", 
                        theme === "arcade90s" ? "bg-arc-bg border-arc-border text-arc-text font-mono" : "bg-brand-dark-pill border-brand-border text-brand-muted"
                      )}>
                        {load.driverTrackingLink}
                      </div>
                      <Button size="icon" variant="outline" onClick={() => copyToClipboard(load.driverTrackingLink!)} className={theme === "arcade90s" ? "rounded-none border-arc-border" : ""}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full">Generate Link</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
