import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, Calendar, Loader2, CheckCircle2, Signal, SignalLow, SignalZero, AlertCircle, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Location send interval: 60 seconds (configurable via env in future)
const SEND_INTERVAL_MS = 60 * 1000;

type TrackingStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error' | 'stopping' | 'stopped';

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
  
  // Tracking state
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('idle');
  const [lastSentTime, setLastSentTime] = useState<Date | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingEndsAt, setTrackingEndsAt] = useState<Date | null>(null);
  
  const watchIdRef = useRef<number | null>(null);
  const lastSendRef = useRef<number>(-SEND_INTERVAL_MS); // Allow first ping immediately
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const driverToken = tokenParams?.token;

  // Fetch load data
  useEffect(() => {
    const fetchLoad = async () => {
      if (!driverToken) {
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

  // Stop tracking and cleanup
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    setTrackingStatus('stopped');
  }, []);

  // Send location to server
  const sendLocation = useCallback(async (position: GeolocationPosition) => {
    if (!driverToken) return;
    
    // Don't send if tracking is stopping or stopped
    if (trackingStatus === 'stopping' || trackingStatus === 'stopped') {
      return;
    }
    
    const now = Date.now();
    // Throttle to SEND_INTERVAL_MS
    if (now - lastSendRef.current < SEND_INTERVAL_MS - 1000) {
      return;
    }
    
    const { latitude, longitude, accuracy, speed, heading } = position.coords;
    
    try {
      const res = await fetch(`/api/driver/${driverToken}/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: latitude,
          lng: longitude,
          accuracy: accuracy || null,
          speed: speed !== null ? speed : null,
          heading: heading !== null ? heading : null,
        }),
      });

      if (res.ok) {
        lastSendRef.current = now;
        setLastSentTime(new Date());
        setTrackingError(null);
        
        // Refresh load data to get updated stop status
        const loadRes = await fetch(`/api/driver/${driverToken}`);
        if (loadRes.ok) {
          const data = await loadRes.json();
          setLoad(data);
        }
      } else if (res.status === 409) {
        // Tracking has ended (load delivered)
        const data = await res.json();
        if (data.trackingEnded) {
          stopTracking();
        }
      }
    } catch (err) {
      console.error("Error sending location:", err);
      setTrackingError("Network error");
    }
  }, [driverToken, trackingStatus, stopTracking]);

  // Start tracking with watchPosition
  const startTracking = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setTrackingStatus('unavailable');
      setTrackingError("Geolocation not supported on this device");
      return;
    }

    setTrackingStatus('requesting');
    
    // Try watchPosition first
    try {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setTrackingStatus('active');
          sendLocation(position);
        },
        (err) => {
          console.error("Geolocation error:", err);
          if (err.code === err.PERMISSION_DENIED) {
            setTrackingStatus('denied');
            setTrackingError("Location permission denied");
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setTrackingError("Location unavailable");
          } else if (err.code === err.TIMEOUT) {
            setTrackingError("Location request timed out");
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        }
      );
      
      watchIdRef.current = watchId;
    } catch (err) {
      // Fallback to getCurrentPosition with interval
      console.log("watchPosition failed, using fallback");
      
      const pollLocation = () => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setTrackingStatus('active');
            sendLocation(position);
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) {
              setTrackingStatus('denied');
              setTrackingError("Location permission denied");
              if (fallbackIntervalRef.current) {
                clearInterval(fallbackIntervalRef.current);
              }
            }
          },
          { enableHighAccuracy: true, timeout: 15000 }
        );
      };
      
      pollLocation();
      fallbackIntervalRef.current = setInterval(pollLocation, SEND_INTERVAL_MS);
    }
  }, [sendLocation]);

  // Request location permission and start tracking
  const requestLocationPermission = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setTrackingStatus('unavailable');
      setTrackingError("Geolocation not supported");
      return;
    }

    setTrackingStatus('requesting');
    
    // This will trigger the permission prompt on iOS Safari
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Permission granted, now start continuous tracking
        setTrackingStatus('active');
        sendLocation(position);
        startTracking();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setTrackingStatus('denied');
          setTrackingError("Location access denied. Please enable in Settings.");
        } else {
          setTrackingStatus('error');
          setTrackingError("Could not get location");
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [sendLocation, startTracking]);

  // Auto-start tracking when load is available
  useEffect(() => {
    if (load && driverToken && trackingStatus === 'idle') {
      // Try to start tracking automatically
      startTracking();
    }
    
    return () => {
      // Cleanup
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }
    };
  }, [load, driverToken, trackingStatus, startTracking]);

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

  const markDeparted = async (stopId: string, stopType: string) => {
    if (!driverToken) return;

    try {
      const res = await fetch(`/api/driver/${driverToken}/stop/${stopId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departedAt: new Date().toISOString() }),
      });

      if (res.ok) {
        const data = await res.json();
        
        // Check if this was a delivery depart that triggered load completion
        if (data.loadDelivered && data.trackingEndsAt) {
          toast.success("Delivery completed! Tracking will stop in 1 minute.");
          setTrackingStatus('stopping');
          setTrackingEndsAt(new Date(data.trackingEndsAt));
          
          // Schedule tracking stop after 60 seconds
          stopTimeoutRef.current = setTimeout(() => {
            stopTracking();
          }, 60000);
        } else {
          toast.success("Marked as departed!");
        }
        
        // Refresh load data
        const loadRes = await fetch(`/api/driver/${driverToken}`);
        if (loadRes.ok) {
          const loadData = await loadRes.json();
          setLoad(loadData);
        }
      } else {
        toast.error("Failed to update stop");
      }
    } catch (err) {
      console.error("Error marking departed:", err);
      toast.error("Failed to update stop");
    }
  };

  // Render tracking status indicator
  const renderTrackingStatus = () => {
    const baseClasses = "text-xs p-3 rounded-lg mb-4 flex items-center gap-2";
    
    switch (trackingStatus) {
      case 'active':
        return (
          <div className={cn(
            baseClasses,
            theme === "arcade90s" 
              ? "bg-arc-secondary/10 text-arc-secondary border border-arc-secondary/30" 
              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
          )} data-testid="status-tracking-active">
            <Signal className="w-4 h-4" />
            <div className="flex-1">
              <div className="font-medium">Tracking: ON</div>
              {lastSentTime && (
                <div className="opacity-70 text-[10px]">
                  Last sent: {format(lastSentTime, "h:mm:ss a")}
                </div>
              )}
            </div>
          </div>
        );
      
      case 'requesting':
        return (
          <div className={cn(
            baseClasses,
            theme === "arcade90s" 
              ? "bg-arc-primary/10 text-arc-primary border border-arc-primary/30" 
              : "bg-brand-gold/10 text-brand-gold border border-brand-gold/30"
          )}>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Requesting location access...</span>
          </div>
        );
      
      case 'denied':
        return (
          <div className="space-y-2 mb-4" data-testid="status-tracking-denied">
            <div className={cn(
              baseClasses,
              "mb-0",
              theme === "arcade90s" 
                ? "bg-red-500/10 text-red-400 border border-red-500/30" 
                : "bg-red-500/10 text-red-400 border border-red-500/30"
            )}>
              <AlertCircle className="w-4 h-4" />
              <div className="flex-1">
                <div className="font-medium">Location access denied</div>
                <div className="opacity-70 text-[10px]">Enable location in your browser settings</div>
              </div>
            </div>
            <Button
              onClick={requestLocationPermission}
              variant="outline"
              className={cn(
                "w-full",
                theme === "arcade90s"
                  ? "border-arc-primary text-arc-primary hover:bg-arc-primary/10 rounded-none"
                  : "border-brand-gold text-brand-gold hover:bg-brand-gold/10"
              )}
              data-testid="button-retry-location"
            >
              <MapPin className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <p className={cn(
              "text-[10px] text-center px-2",
              theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
            )}>
              iOS Safari: Tap the "aA" icon → Website Settings → Location → Allow, then reload this page.
            </p>
          </div>
        );
      
      case 'unavailable':
        return (
          <div className={cn(
            baseClasses,
            theme === "arcade90s" 
              ? "bg-orange-500/10 text-orange-400 border border-orange-500/30" 
              : "bg-orange-500/10 text-orange-400 border border-orange-500/30"
          )}>
            <SignalZero className="w-4 h-4" />
            <span>Geolocation not available on this device</span>
          </div>
        );
      
      case 'error':
        return (
          <div className="space-y-2 mb-4" data-testid="status-tracking-error">
            <div className={cn(
              baseClasses,
              "mb-0",
              theme === "arcade90s" 
                ? "bg-orange-500/10 text-orange-400 border border-orange-500/30" 
                : "bg-orange-500/10 text-orange-400 border border-orange-500/30"
            )}>
              <AlertCircle className="w-4 h-4" />
              <div className="flex-1">
                <div className="font-medium">Could not get location</div>
                <div className="opacity-70 text-[10px]">{trackingError || "Please try again"}</div>
              </div>
            </div>
            <Button
              onClick={requestLocationPermission}
              variant="outline"
              className={cn(
                "w-full",
                theme === "arcade90s"
                  ? "border-arc-primary text-arc-primary hover:bg-arc-primary/10 rounded-none"
                  : "border-brand-gold text-brand-gold hover:bg-brand-gold/10"
              )}
              data-testid="button-retry-location-error"
            >
              <MapPin className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        );
      
      case 'stopping':
        return (
          <div className={cn(
            baseClasses,
            theme === "arcade90s" 
              ? "bg-arc-primary/10 text-arc-primary border border-arc-primary/30" 
              : "bg-brand-gold/10 text-brand-gold border border-brand-gold/30"
          )} data-testid="status-tracking-stopping">
            <CheckCircle2 className="w-4 h-4" />
            <div className="flex-1">
              <div className="font-medium">Delivery completed</div>
              <div className="opacity-70 text-[10px]">Tracking will stop in ~1 minute</div>
            </div>
          </div>
        );
      
      case 'stopped':
        return (
          <div className={cn(
            baseClasses,
            theme === "arcade90s" 
              ? "bg-arc-muted/10 text-arc-muted border border-arc-muted/30" 
              : "bg-gray-500/10 text-gray-400 border border-gray-500/30"
          )} data-testid="status-tracking-stopped">
            <CheckCircle2 className="w-4 h-4" />
            <div className="flex-1">
              <div className="font-medium">Tracking stopped</div>
              <div className="opacity-70 text-[10px]">Load delivered successfully</div>
            </div>
          </div>
        );
      
      case 'idle':
      default:
        return (
          <Button
            onClick={requestLocationPermission}
            className={cn(
              "w-full mb-4",
              theme === "arcade90s"
                ? "bg-arc-primary text-black rounded-none shadow-arc-glow-yellow hover:bg-arc-primary/80"
                : "bg-brand-gold text-black hover:bg-brand-gold/80"
            )}
            data-testid="button-enable-location"
          >
            <MapPin className="w-4 h-4 mr-2" />
            Enable Location Sharing
          </Button>
        );
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

            {/* Location Tracking Status */}
            {renderTrackingStatus()}
            
            {/* Tracking error message */}
            {trackingError && trackingStatus === 'active' && (
              <div className={cn(
                "text-xs p-2 rounded mb-4 flex items-center gap-2",
                "bg-orange-500/10 text-orange-400 border border-orange-500/30"
              )}>
                <AlertCircle className="w-3 h-3" />
                <span>{trackingError}</span>
              </div>
            )}
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
                data-testid={`card-stop-${stop.id}`}
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
                              data-testid={`button-arrive-${stop.id}`}
                            >
                              Arrive
                            </Button>
                          )}
                          {isArrived && (
                            <Button
                              size="sm"
                              onClick={() => markDeparted(stop.id, stop.type)}
                              className={cn(
                                theme === "arcade90s"
                                  ? "bg-arc-primary text-black rounded-none"
                                  : "bg-emerald-500 text-white"
                              )}
                              data-testid={`button-depart-${stop.id}`}
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
