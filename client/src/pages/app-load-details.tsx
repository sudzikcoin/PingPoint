import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useRoute, useLocation } from "wouter";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { ArrowLeft, Copy, Truck, User, Phone, MapPin, Calendar, Link2, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";

interface Stop {
  id: string;
  type: string;
  name: string;
  city: string;
  state: string;
  fullAddress: string;
  sequence: number;
  windowFrom: string | null;
  windowTo: string | null;
  arrivedAt: string | null;
  departedAt: string | null;
}

interface RateConfirmationFile {
  id: string;
  url: string;
  originalName: string;
}

interface LoadDetails {
  id: string;
  loadNumber: string;
  shipperName: string;
  carrierName: string;
  status: string;
  rateAmount: string;
  customerRef: string | null;
  trackingToken: string;
  driverToken: string;
  stops: Stop[];
  rateConfirmationFile: RateConfirmationFile | null;
}

export default function AppLoadDetails() {
  const [, params] = useRoute("/app/loads/:id");
  const [, setLocation] = useLocation();
  const { theme } = useTheme();
  const [load, setLoad] = useState<LoadDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isCopied: isTrackingCopied, copyWithFeedback: copyTrackingFn } = useCopyFeedback();
  const { isCopied: isDriverCopied, copyWithFeedback: copyDriverFn } = useCopyFeedback();

  const copyTracking = async (text: string) => {
    const ok = await copyTrackingFn(text);
    if (!ok) toast.error("Failed to copy tracking link");
  };

  const copyDriver = async (text: string) => {
    const ok = await copyDriverFn(text);
    if (!ok) toast.error("Failed to copy driver link");
  };

  useEffect(() => {
    const fetchLoad = async () => {
      if (!params?.id) return;
      
      try {
        const data = await api.loads.get(params.id);
        setLoad(data);
      } catch (err) {
        console.error("Failed to fetch load:", err);
        setError("Load not found");
      } finally {
        setLoading(false);
      }
    };

    fetchLoad();
  }, [params?.id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted font-mono animate-pulse" : "text-brand-muted animate-pulse")}>
            Loading...
          </p>
        </div>
      </AppLayout>
    );
  }

  if (error || !load) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>
            {error || "Load not found"}
          </p>
          <Button 
            variant="outline" 
            onClick={() => setLocation("/app/loads")}
            className={cn(theme === "arcade90s" ? "rounded-none border-arc-border text-arc-text" : "")}
          >
            Back to Loads
          </Button>
        </div>
      </AppLayout>
    );
  }

  const stops = load.stops || [];
  const pickupStop = stops.find(s => s.type === "PICKUP");
  const deliveryStop = stops.find(s => s.type === "DELIVERY");

  const trackingUrl = `${window.location.origin}/track/${load.trackingToken}`;
  const driverUrl = `${window.location.origin}/driver/${load.driverToken}`;

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
                {load.loadNumber}
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
                {load.carrierName}
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
                {stops.length === 0 ? (
                  <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>No stops defined</p>
                ) : (
                  stops.map((stop, idx) => (
                    <div key={stop.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={cn("w-3 h-3 rounded-full", 
                          theme === "arcade90s" 
                            ? stop.type === "PICKUP" ? "bg-arc-primary" : "bg-arc-secondary"
                            : stop.type === "PICKUP" ? "bg-emerald-500" : "bg-brand-gold"
                        )} />
                        {idx < stops.length - 1 && (
                          <div className={cn("w-0.5 flex-1 my-1", theme === "arcade90s" ? "bg-arc-border" : "bg-brand-border")} />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className={cn("text-xs font-bold uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                              {stop.type} {stop.name ? `• ${stop.name}` : ""}
                            </p>
                            <p className={cn("text-base font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                              {stop.city}, {stop.state}
                            </p>
                            <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                              {stop.fullAddress}
                            </p>
                          </div>
                          {stop.windowFrom && (
                            <div className={cn("text-xs text-right", theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted")}>
                              <div className="flex items-center justify-end gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(stop.windowFrom), "MMM d, HH:mm")}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
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
                    {load.rateAmount ? `$${parseFloat(load.rateAmount).toFixed(2)}` : "—"}
                  </p>
                </div>
                <div>
                  <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Customer Ref</p>
                  <p className={cn("text-sm font-mono", theme === "arcade90s" ? "text-arc-text" : "text-white")}>{load.customerRef || "—"}</p>
                </div>
                <div>
                  <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Load ID</p>
                  <p className={cn("text-sm font-mono truncate", theme === "arcade90s" ? "text-arc-text" : "text-white")}>{load.id.slice(0, 8)}...</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Col: Tracking Links */}
          <div className="space-y-6">
            {/* Tracking Links */}
            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader>
                <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>Tracking Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className={cn("text-xs font-bold uppercase tracking-wide flex items-center gap-2", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                    <Link2 className="w-3 h-3" /> Public Tracking Link
                  </label>
                  <div className="flex gap-2 items-center">
                    <div className={cn("flex-1 p-2 text-xs truncate rounded border", 
                      theme === "arcade90s" ? "bg-arc-bg border-arc-border text-arc-text font-mono" : "bg-brand-dark-pill border-brand-border text-brand-muted"
                    )}>
                      {trackingUrl}
                    </div>
                    <div className="relative">
                      <Button 
                        type="button"
                        size="icon" 
                        variant="outline" 
                        onClick={() => copyTracking(trackingUrl)} 
                        className={cn(
                          theme === "arcade90s" ? "rounded-none border-arc-border" : "",
                          isTrackingCopied && "border-emerald-400"
                        )}
                        data-testid="button-copy-tracking-link"
                      >
                        {isTrackingCopied ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      {isTrackingCopied && (
                        <span className={cn(
                          "absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-full shadow-md whitespace-nowrap",
                          theme === "arcade90s" 
                            ? "bg-arc-primary text-black" 
                            : "bg-emerald-400 text-slate-900"
                        )}>
                          Copied!
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={cn("text-[10px]", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                    Share this with shippers/receivers to track the load
                  </p>
                </div>

                <div className="space-y-2">
                  <label className={cn("text-xs font-bold uppercase tracking-wide flex items-center gap-2", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                    <Truck className="w-3 h-3" /> Driver App Link
                  </label>
                  <div className="flex gap-2 items-center">
                    <div className={cn("flex-1 p-2 text-xs truncate rounded border", 
                      theme === "arcade90s" ? "bg-arc-bg border-arc-border text-arc-text font-mono" : "bg-brand-dark-pill border-brand-border text-brand-muted"
                    )}>
                      {driverUrl}
                    </div>
                    <div className="relative">
                      <Button 
                        type="button"
                        size="icon" 
                        variant="outline" 
                        onClick={() => copyDriver(driverUrl)} 
                        className={cn(
                          theme === "arcade90s" ? "rounded-none border-arc-border" : "",
                          isDriverCopied && "border-emerald-400"
                        )}
                        data-testid="button-copy-driver-link"
                      >
                        {isDriverCopied ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      {isDriverCopied && (
                        <span className={cn(
                          "absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-full shadow-md whitespace-nowrap",
                          theme === "arcade90s" 
                            ? "bg-arc-primary text-black" 
                            : "bg-emerald-400 text-slate-900"
                        )}>
                          Copied!
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={cn("text-[10px]", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                    Share this with the driver to open their mini-app
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader>
                <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  variant="outline" 
                  className={cn("w-full justify-start", theme === "arcade90s" ? "rounded-none border-arc-border text-arc-text" : "")}
                  onClick={() => window.open(trackingUrl, '_blank')}
                  data-testid="button-open-public-tracking"
                >
                  <MapPin className="w-4 h-4 mr-2" /> Open Public Tracking
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
