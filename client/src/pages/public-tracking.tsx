import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Map, Package, Truck, Clock, MapPin, Share2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { PillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/theme-context";
import { useState, useEffect } from "react";

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

interface TrackingData {
  loadNumber: string;
  status: string;
  shipperName: string;
  stops: Stop[];
  lastLocation: {
    lat: string;
    lng: string;
    timestamp: string;
  } | null;
}

export default function PublicTracking() {
  const [matchRoute1, params1] = useRoute("/public/track/:token");
  const [matchRoute2, params2] = useRoute("/track/:token");
  const { theme } = useTheme();
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = params1?.token || params2?.token;

  useEffect(() => {
    const fetchTracking = async () => {
      if (!token) {
        setError("Invalid tracking link");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/track/${token}`);
        if (!res.ok) {
          throw new Error("Load not found");
        }
        const trackingData = await res.json();
        setData(trackingData);
      } catch (err) {
        console.error("Failed to fetch tracking data:", err);
        setError("Tracking link invalid or expired");
      } finally {
        setLoading(false);
      }
    };

    fetchTracking();
  }, [token]);

  if (loading) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center transition-colors", 
        theme === "arcade90s" ? "arcade-bg text-arc-text" : "bg-brand-bg text-brand-text"
      )}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className={cn("h-8 w-8 animate-spin", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")} />
          <p className={cn(theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>Loading tracking info...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center transition-colors", 
        theme === "arcade90s" ? "arcade-bg text-arc-text" : "bg-brand-bg text-brand-text"
      )}>
        <p className={cn(theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>{error || "Tracking link invalid or expired."}</p>
      </div>
    );
  }

  const stops = data.stops || [];
  const currentStop = stops.find(s => !s.arrivedAt) || stops[stops.length - 1];
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];

  const getStopStatus = (stop: Stop) => {
    if (stop.departedAt) return "DEPARTED";
    if (stop.arrivedAt) return "ARRIVED";
    return "PENDING";
  };

  return (
    <div className={cn("min-h-screen font-sans transition-colors duration-300", 
      theme === "arcade90s" ? "arcade-bg text-arc-text" : "bg-brand-bg text-brand-text"
    )}>
      {/* Top Bar */}
      <nav className={cn("px-6 py-4 flex justify-between items-center shadow-lg relative z-20 border-b transition-colors",
        theme === "arcade90s" 
          ? "bg-arc-panel border-arc-secondary/30 shadow-[0_0_15px_rgba(34,211,238,0.1)]" 
          : "bg-brand-card border-brand-border"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shadow-pill-gold transition-all",
            theme === "arcade90s" 
              ? "rounded-none bg-arc-primary text-black shadow-arc-glow-yellow" 
              : "bg-gradient-to-br from-brand-gold-light to-brand-gold-dark"
          )}>
            <Package className={cn("h-5 w-5", theme === "arcade90s" ? "text-black" : "text-[#6b3b05]")} />
          </div>
          <div>
            <span className={cn("font-bold text-lg tracking-tight block leading-none transition-colors",
              theme === "arcade90s" ? "text-arc-primary arcade-pixel-font tracking-widest" : "text-white"
            )}>PingPoint</span>
            <span className={cn("text-[10px] uppercase tracking-widest font-bold",
              theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted"
            )}>Live Tracking</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn("px-3 py-1 rounded-full border font-mono text-xs hidden sm:flex transition-colors",
            theme === "arcade90s" 
              ? "bg-arc-bg border-arc-secondary text-arc-secondary shadow-arc-glow-cyan rounded-none arcade-pixel-font text-[10px]" 
              : "border-brand-border bg-brand-dark-pill text-brand-muted"
          )}>
            REF: {data.loadNumber}
          </div>
          <PillButton 
            variant={theme === "arcade90s" ? "gold" : "dark"} 
            size="md" 
            icon={<Share2 className="w-3 h-3" />} 
            className={cn("hidden sm:flex", theme === "arcade90s" && "rounded-none bg-arc-secondary text-black border-none shadow-arc-glow-cyan hover:bg-arc-secondary/80 arcade-pixel-font text-[10px]")}
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
            }}
          >
            Share
          </PillButton>
        </div>
      </nav>

      <div className="grid lg:grid-cols-3 h-[calc(100vh-73px)]">
        {/* Map Area (2/3 width on desktop) */}
        <div className={cn("lg:col-span-2 relative order-2 lg:order-1 min-h-[300px] border-r transition-colors",
          theme === "arcade90s" ? "bg-arc-bg border-arc-border" : "bg-brand-bg border-brand-border"
        )}>
          <div className={cn("absolute inset-0 flex items-center justify-center bg-cover bg-center opacity-10 grayscale transition-opacity", 
             theme === "arcade90s" ? "bg-[radial-gradient(#22d3ee_1px,transparent_1px)] [background-size:20px_20px] opacity-20" : "bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=2074&auto=format&fit=crop')]"
          )}></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn("backdrop-blur-md p-8 rounded-3xl border flex flex-col items-center gap-4 text-center max-w-sm mx-4 shadow-2xl transition-all",
              theme === "arcade90s" 
                ? "bg-arc-panel/90 border-arc-secondary/50 rounded-none shadow-arc-glow-cyan" 
                : "bg-brand-card/90 border-brand-border"
            )}>
              <div className={cn("h-16 w-16 flex items-center justify-center shadow-pill-dark relative transition-all",
                theme === "arcade90s" 
                  ? "rounded-none border-2 border-arc-primary bg-arc-bg text-arc-primary shadow-arc-glow-yellow" 
                  : "rounded-full bg-brand-dark-pill border border-brand-border text-brand-gold"
              )}>
                <div className={cn("absolute inset-0 animate-ping",
                  theme === "arcade90s" ? "bg-arc-primary/20 rounded-none" : "rounded-full bg-brand-gold/10"
                )} />
                <Map className="h-8 w-8" />
              </div>
              <div>
                <h3 className={cn("text-xl font-bold transition-colors", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font tracking-wide" : "text-white")}>Live Tracking Active</h3>
                <p className={cn("text-sm mt-2 leading-relaxed", theme === "arcade90s" ? "text-arc-muted font-mono text-xs" : "text-brand-muted")}>Vehicle location is updated every 15 minutes via secure GPS link.</p>
              </div>
              {data.lastLocation && (
                 <div className={cn("mt-2 px-4 py-1.5 text-xs font-bold tracking-wide uppercase transition-all",
                   theme === "arcade90s"
                     ? "bg-arc-secondary/10 border border-arc-secondary text-arc-secondary arcade-pixel-font text-[10px] shadow-arc-glow-cyan"
                     : "rounded-full bg-brand-gold/10 border border-brand-gold/20 text-brand-gold"
                 )}>
                   Last ping: {format(new Date(data.lastLocation.timestamp), "MMM d, HH:mm")}
                 </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Info (1/3 width) */}
        <div className={cn("order-1 lg:order-2 overflow-y-auto border-l shadow-2xl relative z-10 transition-colors",
          theme === "arcade90s" ? "bg-arc-panel border-arc-border" : "bg-brand-card border-brand-border"
        )}>
          <div className="p-6 space-y-8">
            {/* Header Info */}
            <div className="space-y-5">
              <div>
                <p className={cn("text-xs uppercase tracking-widest font-bold mb-2 transition-colors", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>Current Status</p>
                <div className="flex items-center gap-4">
                  <h1 className={cn("text-3xl font-bold tracking-tight transition-colors", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white")}>{data.status.replace("_", " ")}</h1>
                  <div className={cn("h-3 w-3 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.6)]",
                    theme === "arcade90s" ? "bg-arc-primary shadow-arc-glow-yellow rounded-none" : "bg-emerald-500"
                  )} />
                </div>
                {lastStop?.windowFrom && (
                  <p className={cn("mt-3 text-sm leading-relaxed transition-colors", theme === "arcade90s" ? "text-arc-text/80 font-mono text-xs" : "text-brand-text/80")}>
                    Your shipment is on schedule. Estimated arrival at destination: <span className={cn("font-mono", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")}>{format(new Date(lastStop.windowFrom), "MMM d, h:mm a")}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Progress Visual */}
            {stops.length >= 2 && (
              <div className={cn("space-y-4 p-4 border transition-all",
                theme === "arcade90s" 
                  ? "bg-arc-bg/50 rounded-none border-arc-secondary/30 shadow-arc-glow-cyan" 
                  : "bg-brand-dark-pill/50 rounded-2xl border-brand-border/50"
              )}>
                 <div className={cn("flex items-center justify-between text-[10px] font-bold uppercase tracking-widest transition-colors", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>
                   <span>Origin</span>
                   <span>Destination</span>
                 </div>
                 <div className={cn("h-2 rounded-full overflow-hidden relative transition-all", theme === "arcade90s" ? "bg-arc-border rounded-none" : "bg-brand-border")}>
                   <div className={cn("absolute inset-y-0 left-0 transition-all",
                     theme === "arcade90s" 
                       ? "bg-arc-primary shadow-arc-glow-yellow" 
                       : "bg-gradient-to-r from-brand-gold-light to-brand-gold-dark rounded-full shadow-pill-gold"
                   )} style={{ width: `${Math.min(100, Math.max(10, (stops.filter(s => s.departedAt).length / stops.length) * 100 + 10))}%` }} />
                 </div>
                 <div className={cn("flex items-center justify-between text-sm font-bold transition-colors", theme === "arcade90s" ? "text-arc-text arcade-pixel-font text-[10px]" : "text-white")}>
                   <span>{firstStop?.city || "Origin"}</span>
                   <span>{lastStop?.city || "Destination"}</span>
                 </div>
              </div>
            )}

            {/* Stop List */}
            <div>
              <p className={cn("text-xs uppercase tracking-widest font-bold mb-6 pl-2 transition-colors", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>Route Details</p>
              <div className="space-y-0 relative pl-2">
                <div className={cn("absolute top-2 bottom-4 left-[19px] w-0.5 transition-colors", theme === "arcade90s" ? "bg-arc-border" : "bg-brand-border")} />
                
                {stops.map((stop, idx) => {
                   const status = getStopStatus(stop);
                   const isCompleted = status === "DEPARTED" || status === "ARRIVED";
                   const isCurrent = stop.id === currentStop?.id;

                   return (
                    <div key={stop.id} className="relative pl-10 pb-10 last:pb-0 group">
                      <div className={cn("absolute left-[12px] top-1.5 h-4 w-4 z-10 transition-all duration-500",
                        theme === "arcade90s"
                          ? isCompleted 
                            ? "bg-arc-primary border-2 border-arc-primary shadow-arc-glow-yellow rounded-none" 
                            : isCurrent 
                              ? "bg-arc-secondary border-2 border-arc-secondary shadow-arc-glow-cyan animate-pulse rounded-none rotate-45" 
                              : "bg-arc-bg border-2 border-arc-border rounded-none"
                          : isCompleted 
                            ? "bg-emerald-500 border-2 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)] rounded-full" 
                            : isCurrent 
                              ? "bg-brand-gold border-2 border-brand-gold ring-4 ring-brand-gold/20 shadow-[0_0_10px_rgba(245,197,80,0.4)] rounded-full" 
                              : "bg-brand-card border-2 border-brand-border rounded-full"
                      )}>
                        {isCompleted && theme !== "arcade90s" && <div className="h-full w-full flex items-center justify-center text-brand-card"><div className="h-1.5 w-1.5 bg-brand-card rounded-full" /></div>}
                      </div>
                      
                      <div className={`transition-all duration-500 ${isCurrent ? "opacity-100 translate-x-0" : isCompleted ? "opacity-60" : "opacity-40"}`}>
                        <h4 className={cn("text-base font-bold transition-colors", theme === "arcade90s" ? "text-arc-text group-hover:text-arc-primary arcade-pixel-font tracking-wide" : "text-white group-hover:text-brand-gold")}>{stop.city}, {stop.state}</h4>
                        <p className={cn("text-sm mt-0.5 transition-colors", theme === "arcade90s" ? "text-arc-muted font-mono text-xs" : "text-brand-muted")}>{stop.fullAddress || stop.name}</p>
                        {stop.windowFrom && (
                          <div className={cn("flex items-center gap-2 mt-2 text-xs font-mono w-fit px-2 py-1 border transition-colors",
                            theme === "arcade90s" 
                              ? "text-arc-secondary bg-arc-bg border-arc-secondary/30 rounded-none" 
                              : "text-brand-muted/80 bg-brand-dark-pill/50 border-brand-border/50 rounded"
                          )}>
                            <Clock className="h-3 w-3" />
                            {format(new Date(stop.windowFrom), "MMM d, HH:mm")}
                          </div>
                        )}
                      </div>
                    </div>
                   );
                })}
              </div>
            </div>
          </div>
          
          {/* Footer Area */}
          <div className={cn("p-6 border-t transition-colors", theme === "arcade90s" ? "border-arc-border bg-arc-bg" : "border-brand-border bg-brand-card/50")}>
            <div className="flex items-start gap-4">
              <div className={cn("h-10 w-10 flex items-center justify-center shrink-0 transition-all",
                theme === "arcade90s" ? "rounded-none border border-arc-muted bg-arc-bg text-arc-muted" : "rounded-full bg-brand-dark-pill border border-brand-border"
              )}>
                 <Truck className={cn("h-5 w-5", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")} />
              </div>
              <div>
                <p className={cn("text-sm font-bold transition-colors", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white")}>Shipment Information</p>
                <p className={cn("text-xs mt-1 transition-colors", theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted")}>Shipper: <span className={cn("font-medium", theme === "arcade90s" ? "text-arc-text" : "text-white")}>{data.shipperName}</span></p>
                <p className={cn("text-[10px] font-mono mt-2 uppercase tracking-wide transition-colors", theme === "arcade90s" ? "text-arc-muted/60" : "text-brand-muted")}>Load #{data.loadNumber}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
