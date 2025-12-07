import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Truck, ChevronRight, Navigation, Calendar, MapPin, Loader2, CheckCircle2, Circle } from "lucide-react";
import { format } from "date-fns";
import { PillButton } from "@/components/ui/pill-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

interface LoadData {
  id: string;
  loadNumber: string;
  customerRef: string | null;
  status: string;
  stops: Stop[];
}

export default function DriverDashboard() {
  const [, setLocation] = useLocation();
  const [matchTokenRoute, tokenParams] = useRoute("/driver/:token");
  const { theme } = useTheme();
  const [load, setLoad] = useState<LoadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingPing, setSendingPing] = useState(false);

  const driverToken = tokenParams?.token;

  useEffect(() => {
    const fetchLoad = async () => {
      if (!driverToken) {
        // No token - show welcome screen
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/driver/${driverToken}`);
        if (!res.ok) {
          throw new Error("Load not found");
        }
        const data = await res.json();
        setLoad(data);
      } catch (err) {
        console.error("Failed to fetch driver load:", err);
        setError("Invalid or expired driver link");
      } finally {
        setLoading(false);
      }
    };

    fetchLoad();
  }, [driverToken]);

  const sendLocationPing = async () => {
    if (!driverToken) return;

    setSendingPing(true);
    try {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            
            const res = await fetch(`/api/driver/${driverToken}/ping`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lat: latitude, lng: longitude, accuracy }),
            });

            if (res.ok) {
              toast.success("Location sent successfully!");
            } else {
              toast.error("Failed to send location");
            }
            setSendingPing(false);
          },
          (err) => {
            console.error("Geolocation error:", err);
            toast.error("Could not get your location. Please enable GPS.");
            setSendingPing(false);
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } else {
        toast.error("Geolocation not supported on this device");
        setSendingPing(false);
      }
    } catch (err) {
      console.error("Error sending ping:", err);
      toast.error("Failed to send location");
      setSendingPing(false);
    }
  };

  const markArrived = async (stopId: string) => {
    if (!driverToken) return;

    try {
      const res = await fetch(`/api/driver/${driverToken}/stop/${stopId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arrivedAt: new Date().toISOString() }),
      });

      if (res.ok) {
        toast.success("Marked as arrived!");
        // Refresh load data
        const loadRes = await fetch(`/api/driver/${driverToken}`);
        if (loadRes.ok) {
          const data = await loadRes.json();
          setLoad(data);
        }
      } else {
        toast.error("Failed to update stop");
      }
    } catch (err) {
      console.error("Error marking arrived:", err);
      toast.error("Failed to update stop");
    }
  };

  const markDeparted = async (stopId: string) => {
    if (!driverToken) return;

    try {
      const res = await fetch(`/api/driver/${driverToken}/stop/${stopId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departedAt: new Date().toISOString() }),
      });

      if (res.ok) {
        toast.success("Marked as departed!");
        // Refresh load data
        const loadRes = await fetch(`/api/driver/${driverToken}`);
        if (loadRes.ok) {
          const data = await loadRes.json();
          setLoad(data);
        }
      } else {
        toast.error("Failed to update stop");
      }
    } catch (err) {
      console.error("Error marking departed:", err);
      toast.error("Failed to update stop");
    }
  };

  if (loading) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center transition-colors", 
        theme === "arcade90s" ? "arcade-bg text-arc-text" : "bg-brand-bg text-brand-text"
      )}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className={cn("h-8 w-8 animate-spin", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")} />
          <p className={cn(theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>Loading your load...</p>
        </div>
      </div>
    );
  }

  // No token provided - show welcome/instructions screen
  if (!driverToken && !loading) {
    return (
      <div className={cn("min-h-screen flex flex-col items-center justify-center gap-6 p-6 transition-colors", 
        theme === "arcade90s" ? "arcade-bg text-arc-text" : "bg-brand-bg text-brand-text"
      )}>
        <div className={cn(
          "p-8 rounded-2xl border text-center max-w-md",
          theme === "arcade90s" 
            ? "arcade-panel border-arc-secondary/50 shadow-arc-glow-cyan rounded-none" 
            : "bg-brand-card border-brand-border"
        )}>
          <div className={cn(
            "w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center",
            theme === "arcade90s" 
              ? "bg-arc-bg border-2 border-arc-secondary rounded-none" 
              : "bg-brand-dark-pill border border-brand-border"
          )}>
            <Truck className={cn("h-10 w-10", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")} />
          </div>
          <h1 className={cn("text-2xl font-bold mb-4", theme === "arcade90s" ? "arcade-pixel-font text-arc-primary" : "text-white")}>
            Driver Portal
          </h1>
          <p className={cn("mb-6", theme === "arcade90s" ? "text-arc-muted font-mono text-sm" : "text-brand-muted")}>
            To access your assigned load, please use the link that was sent to your phone via SMS.
          </p>
          <div className={cn(
            "p-4 rounded border text-left",
            theme === "arcade90s" ? "bg-arc-bg border-arc-border" : "bg-brand-dark-pill border-brand-border"
          )}>
            <p className={cn("text-xs uppercase tracking-wider mb-2 font-bold", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>
              How it works:
            </p>
            <ol className={cn("text-sm space-y-2 list-decimal list-inside", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
              <li>Your dispatcher creates a load</li>
              <li>You receive an SMS with a unique link</li>
              <li>Click the link to view your route and send location updates</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("min-h-screen flex flex-col items-center justify-center gap-4 p-6 transition-colors", 
        theme === "arcade90s" ? "arcade-bg text-arc-text" : "bg-brand-bg text-brand-text"
      )}>
        <Truck className={cn("h-16 w-16", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")} />
        <p className={cn("text-center", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>
          {error}
        </p>
      </div>
    );
  }

  if (!load) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center transition-colors", 
        theme === "arcade90s" ? "arcade-bg text-arc-text" : "bg-brand-bg text-brand-text"
      )}>
        <Loader2 className={cn("h-8 w-8 animate-spin", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")} />
      </div>
    );
  }

  const stops = load.stops || [];
  const currentStop = stops.find(s => !s.arrivedAt) || stops[stops.length - 1];
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];

  // Show broker's customer reference if available, otherwise fall back to internal load number
  const driverDisplayId = 
    load.customerRef && load.customerRef.trim().length > 0
      ? load.customerRef.trim()
      : load.loadNumber;

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
            "text-center flex-1 ml-8",
            theme === "arcade90s"
              ? "arcade-pixel-font arcade-title text-lg tracking-widest"
              : "text-sm sm:text-base md:text-lg font-semibold tracking-[0.25em] uppercase text-brand-text/80"
          )}>
            {theme === "arcade90s" ? (
              <>
                PINGPOINT <span className="arcade-subtitle text-[0.6em] block sm:inline sm:ml-2">DRIVER</span>
              </>
            ) : (
              <>
                <span className="text-brand-text">PingPoint</span>
                <span className="ml-2 text-[0.65em] font-medium text-brand-muted">Driver</span>
              </>
            )}
          </h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Load Info Card */}
        <Card className={cn(
          "overflow-hidden transition-all duration-300",
          theme === "arcade90s"
            ? "arcade-panel border-arc-secondary/50 shadow-arc-glow-cyan rounded-none"
            : "bg-brand-card border-brand-border shadow-pill-dark"
        )}>
          <CardHeader className={cn(
            "pb-2",
            theme === "arcade90s" ? "border-b border-arc-border" : ""
          )}>
            <div className="flex items-center justify-between">
              <CardTitle className={cn(
                "text-lg",
                theme === "arcade90s" ? "arcade-pixel-font text-arc-primary" : "text-white"
              )}>
                Load #{driverDisplayId}
              </CardTitle>
              <Badge className={cn(
                theme === "arcade90s"
                  ? "bg-arc-secondary/20 text-arc-secondary border-arc-secondary rounded-none"
                  : "bg-brand-gold/20 text-brand-gold border-brand-gold/30"
              )}>
                {load.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {/* Route Summary */}
            {stops.length >= 2 && (
              <div className="flex items-center justify-between mb-4">
                <div className="text-center">
                  <p className={cn("text-xs uppercase tracking-wider", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>From</p>
                  <p className={cn("font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")}>{firstStop?.city}</p>
                </div>
                <div className={cn("flex-1 h-0.5 mx-4", theme === "arcade90s" ? "bg-arc-border" : "bg-brand-border")} />
                <div className="text-center">
                  <p className={cn("text-xs uppercase tracking-wider", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>To</p>
                  <p className={cn("font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")}>{lastStop?.city}</p>
                </div>
              </div>
            )}

            {/* Send Location Button */}
            <Button
              onClick={sendLocationPing}
              disabled={sendingPing}
              className={cn(
                "w-full mb-4",
                theme === "arcade90s"
                  ? "bg-arc-primary text-black rounded-none shadow-arc-glow-yellow hover:bg-arc-primary/80"
                  : "bg-brand-gold text-black hover:bg-brand-gold/80"
              )}
            >
              <Navigation className="w-4 h-4 mr-2" />
              {sendingPing ? "Sending..." : "Send My Location"}
            </Button>
          </CardContent>
        </Card>

        {/* Stops List */}
        <div className="space-y-4">
          <h2 className={cn(
            "text-sm uppercase tracking-widest font-bold px-2",
            theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted"
          )}>
            Stops
          </h2>

          {stops.map((stop, idx) => {
            const isCompleted = stop.departedAt;
            const isArrived = stop.arrivedAt && !stop.departedAt;
            const isPending = !stop.arrivedAt;

            return (
              <Card 
                key={stop.id}
                className={cn(
                  "overflow-hidden transition-all duration-300",
                  theme === "arcade90s"
                    ? isCompleted
                      ? "arcade-panel border-arc-primary/50 opacity-60 rounded-none"
                      : isArrived
                        ? "arcade-panel border-arc-secondary shadow-arc-glow-cyan rounded-none"
                        : "arcade-panel border-arc-border rounded-none"
                    : isCompleted
                      ? "bg-brand-card/50 border-brand-border/50"
                      : isArrived
                        ? "bg-brand-card border-brand-gold shadow-lg"
                        : "bg-brand-card border-brand-border"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Status Icon */}
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                      theme === "arcade90s"
                        ? isCompleted
                          ? "bg-arc-primary text-black rounded-none"
                          : isArrived
                            ? "bg-arc-secondary text-black rounded-none"
                            : "bg-arc-bg border border-arc-border text-arc-muted rounded-none"
                        : isCompleted
                          ? "bg-emerald-500 text-white"
                          : isArrived
                            ? "bg-brand-gold text-black"
                            : "bg-brand-dark-pill border border-brand-border text-brand-muted"
                    )}>
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <span className={cn("text-sm font-bold", theme === "arcade90s" ? "arcade-pixel-font" : "")}>{idx + 1}</span>
                      )}
                    </div>

                    {/* Stop Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={cn(
                          "text-[10px]",
                          theme === "arcade90s"
                            ? "border-arc-border text-arc-muted rounded-none"
                            : "border-brand-border text-brand-muted"
                        )}>
                          {stop.type}
                        </Badge>
                        {stop.name && (
                          <span className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                            {stop.name}
                          </span>
                        )}
                      </div>
                      <p className={cn("font-bold text-lg", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                        {stop.city}, {stop.state}
                      </p>
                      <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        {stop.fullAddress}
                      </p>
                      {stop.windowFrom && (
                        <div className={cn("flex items-center gap-2 mt-2 text-xs", theme === "arcade90s" ? "text-arc-secondary font-mono" : "text-brand-muted")}>
                          <Calendar className="w-3 h-3" />
                          {format(new Date(stop.windowFrom), "MMM d, HH:mm")}
                        </div>
                      )}

                      {/* Action Buttons */}
                      {!isCompleted && (
                        <div className="flex gap-2 mt-3">
                          {isPending && (
                            <Button
                              size="sm"
                              onClick={() => markArrived(stop.id)}
                              className={cn(
                                theme === "arcade90s"
                                  ? "bg-arc-secondary text-black rounded-none"
                                  : "bg-brand-gold text-black"
                              )}
                            >
                              Arrive
                            </Button>
                          )}
                          {isArrived && (
                            <Button
                              size="sm"
                              onClick={() => markDeparted(stop.id)}
                              className={cn(
                                theme === "arcade90s"
                                  ? "bg-arc-primary text-black rounded-none"
                                  : "bg-emerald-500 text-white"
                              )}
                            >
                              Depart
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
