import { useRoute, useLocation } from "wouter";
import { getLoadById, Load, Stop, StopStatus } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Map, Navigation, Upload, CheckCircle2, Clock, Play, Square } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// --- StopRow Component ---

interface StopRowProps {
  stop: Stop;
  onStatusUpdate: (stopId: string, status: "ARRIVED" | "DEPARTED") => Promise<void>;
}

function StopRow({ stop, onStatusUpdate }: StopRowProps) {
  const [isArriveLoading, setIsArriveLoading] = useState(false);
  const [isDepartLoading, setIsDepartLoading] = useState(false);

  const handleUpdate = async (newStatus: "ARRIVED" | "DEPARTED") => {
    if (newStatus === "ARRIVED") setIsArriveLoading(true);
    else setIsDepartLoading(true);

    try {
      await onStatusUpdate(stop.id, newStatus);
    } catch (error) {
      console.error(error);
      // Toast is handled in parent, but we could add one here too if needed
    } finally {
      if (newStatus === "ARRIVED") setIsArriveLoading(false);
      else setIsDepartLoading(false);
    }
  };

  // Status Pill Logic
  const getStatusPill = (status: StopStatus) => {
    let text = "";
    let classes = "";

    switch (status) {
      case "PLANNED":
        text = "Planned";
        classes = "bg-gray-800 text-gray-200";
        break;
      case "EN_ROUTE":
        text = "En route";
        classes = "bg-blue-900 text-blue-200";
        break;
      case "ARRIVED":
        text = "Arrived";
        classes = "bg-emerald-900 text-emerald-200";
        break;
      case "DEPARTED":
        text = "Departed";
        classes = "bg-teal-900 text-teal-200";
        break;
      case "SKIPPED":
        text = "Skipped";
        classes = "bg-red-900 text-red-200";
        break;
      default:
        text = status;
        classes = "bg-gray-800 text-gray-200";
    }

    return (
      <div className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", classes)}>
        {text}
      </div>
    );
  };

  // Button Logic
  const showButtons = stop.type === "PICKUP" || stop.type === "DELIVERY";
  
  const baseBtn = "inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium rounded-md border transition disabled:opacity-40 disabled:cursor-not-allowed h-8";
  const primaryBtn = cn(baseBtn, "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-500");
  const secondaryBtn = cn(baseBtn, "border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700");
  const disabledBtn = cn(baseBtn, "border-slate-700 bg-slate-900 text-slate-400");

  const isArrived = stop.status === "ARRIVED";
  const isDeparted = stop.status === "DEPARTED";
  const isPlannedOrEnRoute = stop.status === "PLANNED" || stop.status === "EN_ROUTE";

  // Arrive Button State
  let arriveBtnClass = primaryBtn;
  let arriveDisabled = false;

  if (isArrived || isDeparted) {
    arriveBtnClass = disabledBtn;
    arriveDisabled = true;
  }

  // Depart Button State
  let departBtnClass = secondaryBtn;
  let departDisabled = false;

  if (isArrived) {
    departBtnClass = primaryBtn; // Active step
  } else if (isDeparted) {
    departBtnClass = disabledBtn;
    departDisabled = true;
  } else if (isPlannedOrEnRoute) {
    // Can't depart before arriving (usually), but spec says:
    // "When status PLANNED or EN_ROUTE: Departed: secondaryBtn"
    // So we leave it enabled but secondary.
    departBtnClass = secondaryBtn;
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg bg-slate-900/60 px-3 py-2 border border-slate-800">
      {/* Left Column */}
      <div className="flex flex-col gap-1">
        {/* Type & Sequence */}
        <div className="text-xs uppercase tracking-wide text-slate-400">
          {stop.type === "PICKUP" ? "Pickup" : stop.type === "DELIVERY" ? "Delivery" : stop.type} #{stop.sequence}
        </div>
        
        {/* Name (City/State or Facility Name if available) */}
        <div className="text-sm font-medium text-slate-50">
          {stop.city}, {stop.state}
        </div>

        {/* Address */}
        <div className="text-xs text-slate-300">
          {stop.addressLine1} {stop.zip}
        </div>

        {/* Time Window */}
        <div className="text-xs text-slate-400">
           {format(new Date(stop.windowStart), "MM/dd HH:mm")} – {format(new Date(stop.windowEnd), "HH:mm")}
        </div>
      </div>

      {/* Right Column */}
      <div className="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
        {/* Status Pill & Timestamps */}
        <div className="flex flex-col items-end gap-1">
          {getStatusPill(stop.status)}
          
          {stop.arrivedAt && (
             <span className="text-[10px] text-slate-400 font-mono">
               Arrived: {format(new Date(stop.arrivedAt), "HH:mm")}
             </span>
          )}
          {stop.departedAt && (
             <span className="text-[10px] text-slate-400 font-mono">
               Departed: {format(new Date(stop.departedAt), "HH:mm")}
             </span>
          )}
        </div>

        {/* Buttons */}
        {showButtons && (
          <div className="flex flex-row gap-2 mt-1">
            <button
              className={arriveBtnClass}
              disabled={arriveDisabled || isArriveLoading}
              onClick={() => handleUpdate("ARRIVED")}
            >
              {isArriveLoading ? "Arriving..." : "Arrive"}
            </button>
            <button
              className={departBtnClass}
              disabled={departDisabled || isDepartLoading}
              onClick={() => handleUpdate("DEPARTED")}
            >
              {isDepartLoading ? "Departing..." : "Departed"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main Page Component ---

export default function LoadDetails() {
  const [, params] = useRoute("/driver/loads/:id");
  const [, setLocation] = useLocation();
  const [load, setLoad] = useState<Load | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching data
    const fetchedLoad = getLoadById(params?.id || "");
    setLoad(fetchedLoad ? { ...fetchedLoad } : undefined);
    setLoading(false);
  }, [params?.id]);

  const handleStopStatusUpdate = async (stopId: string, newStatus: "ARRIVED" | "DEPARTED") => {
    if (!load) return;

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Update local state
    setLoad(prev => {
      if (!prev) return undefined;
      return {
        ...prev,
        stops: prev.stops.map(stop => {
          if (stop.id === stopId) {
            return {
              ...stop,
              status: newStatus,
              arrivedAt: newStatus === "ARRIVED" ? new Date().toISOString() : stop.arrivedAt,
              departedAt: newStatus === "DEPARTED" ? new Date().toISOString() : stop.departedAt
            };
          }
          return stop;
        })
      };
    });

    toast.success(`Stop marked as ${newStatus.toLowerCase()}`);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Loading...</p></div>;
  }

  if (!load) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <p className="text-muted-foreground">Load not found</p>
        <Button variant="outline" onClick={() => setLocation("/driver")}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="container mx-auto px-4 h-14 flex items-center gap-4">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setLocation("/driver")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground font-mono">LOAD #{load.externalLoadId}</p>
            <h1 className="text-sm font-bold">{load.brokerName}</h1>
          </div>
          <Badge variant={load.status === "IN_TRANSIT" ? "default" : "secondary"} className="text-[10px]">
            {load.status}
          </Badge>
        </div>
      </header>

      <main className="container mx-auto p-4 space-y-6">
        {/* Map Placeholder */}
        <div className="aspect-[16/9] bg-muted/30 rounded-lg border border-border/50 flex items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]" />
          <div className="flex flex-col items-center gap-2 text-muted-foreground z-10">
            <Map className="h-8 w-8 opacity-50" />
            <span className="text-xs font-medium uppercase tracking-widest">Interactive Map View</span>
          </div>
          {/* Floating Action Button on Map */}
          <Button size="sm" className="absolute bottom-4 right-4 shadow-lg gap-2">
            <Navigation className="h-3 w-3" /> Navigate
          </Button>
        </div>

        {/* Stops List */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Route Plan</h2>
          <div className="space-y-3">
            {load.stops.map((stop) => (
              <StopRow 
                key={stop.id} 
                stop={stop} 
                onStatusUpdate={handleStopStatusUpdate} 
              />
            ))}
          </div>
        </div>

        <Separator className="bg-border/50" />

        {/* Documents Section Mockup */}
        <div className="space-y-3">
           <div className="flex items-center justify-between">
             <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Documents</h2>
             <Button variant="ghost" size="sm" className="h-6 text-xs text-primary">View All</Button>
           </div>
           <Card className="bg-card/30 border-dashed border-border">
             <CardContent className="p-4 flex items-center justify-center flex-col gap-2 py-8 cursor-pointer hover:bg-card/50 transition-colors">
               <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                 <Upload className="h-5 w-5 text-muted-foreground" />
               </div>
               <div className="text-center">
                 <p className="text-sm font-medium">Upload POD / BOL</p>
                 <p className="text-xs text-muted-foreground">Tap to scan or upload document</p>
               </div>
             </CardContent>
           </Card>
        </div>
      </main>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-xl border-t border-border/40">
        <div className="container mx-auto max-w-md flex gap-3">
          <Button className="w-full font-semibold shadow-lg shadow-primary/20" size="lg">
            Update Load Status
          </Button>
        </div>
      </div>
    </div>
  );
}
