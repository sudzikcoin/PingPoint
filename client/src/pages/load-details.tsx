import { useRoute, useLocation } from "wouter";
import { getLoadById, Load, Stop, StopStatus } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { PillButton } from "@/components/ui/pill-button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Map, Navigation, CheckCircle2, Clock, Play, Square, FileText, Loader2, Upload, Check } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect, useRef } from "react";
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
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUpdate = async (newStatus: "ARRIVED" | "DEPARTED") => {
    if (newStatus === "ARRIVED") setIsArriveLoading(true);
    else setIsDepartLoading(true);

    try {
      await onStatusUpdate(stop.id, newStatus);
    } catch (error) {
      console.error(error);
    } finally {
      if (newStatus === "ARRIVED") setIsArriveLoading(false);
      else setIsDepartLoading(false);
    }
  };

  const handleOpenFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success(`Document uploaded for ${stop.type.toLowerCase()}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload document");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Status Pill Logic
  const getStatusPill = (status: StopStatus) => {
    let text = "";
    let classes = "";

    switch (status) {
      case "PLANNED":
        text = "Planned";
        classes = "bg-brand-dark-pill text-brand-muted border border-brand-border";
        break;
      case "EN_ROUTE":
        text = "En route";
        classes = "bg-blue-900/30 text-blue-200 border border-blue-800/50";
        break;
      case "ARRIVED":
        text = "Arrived";
        classes = "bg-emerald-900/30 text-emerald-200 border border-emerald-800/50";
        break;
      case "DEPARTED":
        text = "Departed";
        classes = "bg-teal-900/30 text-teal-200 border border-teal-800/50";
        break;
      case "SKIPPED":
        text = "Skipped";
        classes = "bg-red-900/30 text-red-200 border border-red-800/50";
        break;
      default:
        text = status;
        classes = "bg-gray-800 text-gray-200";
    }

    return (
      <div className={cn("inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold tracking-wider uppercase shadow-sm", classes)}>
        {text}
      </div>
    );
  };

  const showButtons = stop.type === "PICKUP" || stop.type === "DELIVERY";
  const canUploadDoc = stop.type === "PICKUP" || stop.type === "DELIVERY";
  
  const isArrived = stop.status === "ARRIVED";
  const isDeparted = stop.status === "DEPARTED";
  const isPlannedOrEnRoute = stop.status === "PLANNED" || stop.status === "EN_ROUTE";

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-brand-card px-4 py-4 border border-brand-border shadow-lg shadow-black/20 relative overflow-hidden group">
      {/* Decorative gradient glow */}
      {isArrived && <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />}
      {isDeparted && <div className="absolute top-0 left-0 w-1 h-full bg-teal-600" />}
      {isPlannedOrEnRoute && <div className="absolute top-0 left-0 w-1 h-full bg-brand-border" />}

      {/* Top Row: Info & Status */}
      <div className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-widest font-bold text-brand-muted flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", 
              stop.type === "PICKUP" ? "bg-brand-gold" : "bg-emerald-400"
            )} />
            {stop.type} #{stop.sequence}
          </div>
          
          <div className="text-base font-bold text-white mt-1">
            {stop.city}, {stop.state}
          </div>

          <div className="text-xs text-brand-muted">
            {stop.addressLine1}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {getStatusPill(stop.status)}
          <div className="text-[10px] text-brand-muted font-mono flex items-center gap-1 bg-brand-dark-pill px-2 py-1 rounded-md border border-brand-border">
             <Clock className="w-3 h-3" />
             {format(new Date(stop.windowStart), "HH:mm")} - {format(new Date(stop.windowEnd), "HH:mm")}
          </div>
        </div>
      </div>

      {/* Timestamps if available */}
      {(stop.arrivedAt || stop.departedAt) && (
        <div className="flex gap-3 text-[10px] text-brand-muted font-mono pl-3 border-l border-brand-border">
          {stop.arrivedAt && <span>Arr: {format(new Date(stop.arrivedAt), "HH:mm")}</span>}
          {stop.departedAt && <span>Dep: {format(new Date(stop.departedAt), "HH:mm")}</span>}
        </div>
      )}

      {/* Actions Row */}
      {showButtons && (
        <div className="flex items-center gap-3 pt-2 border-t border-brand-border/50">
           {/* Upload Button */}
           {canUploadDoc && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-brand-border bg-brand-dark-pill text-brand-muted hover:bg-brand-border hover:text-white transition-all active:scale-95 shadow-inner"
                  disabled={isUploading}
                  onClick={handleOpenFilePicker}
                  title="Upload Document"
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </button>
              </>
            )}
            
            <div className="flex-1 flex gap-2 justify-end">
              {/* Arrive Button */}
              <PillButton 
                variant="gold" 
                size="md"
                className={cn("flex-1", (isArrived || isDeparted) && "opacity-50 grayscale")}
                disabled={isArrived || isDeparted || isArriveLoading}
                onClick={() => handleUpdate("ARRIVED")}
                icon={isArrived || isDeparted ? <Check className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
              >
                {isArrived || isDeparted ? "Arrived" : isArriveLoading ? "Arriving..." : "Arrive"}
              </PillButton>

              {/* Depart Button */}
              <PillButton 
                variant="dark" 
                size="md"
                className={cn("flex-1", isDeparted && "opacity-50")}
                disabled={!isArrived || isDeparted || isDepartLoading} // Enabled only after arrived
                onClick={() => handleUpdate("DEPARTED")}
                icon={isDeparted ? <Check className="w-3 h-3" /> : <Square className="w-3 h-3 fill-current" />}
              >
                {isDeparted ? "Departed" : isDepartLoading ? "Departing..." : "Departed"}
              </PillButton>
            </div>
        </div>
      )}
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
    return <div className="min-h-screen flex items-center justify-center bg-brand-bg text-brand-muted"><p>Loading...</p></div>;
  }

  if (!load) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 bg-brand-bg text-brand-text">
        <p className="text-brand-muted">Load not found</p>
        <Button variant="outline" onClick={() => setLocation("/driver")}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg pb-10 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-brand-bg/80 backdrop-blur-md border-b border-brand-border">
        <div className="container mx-auto px-4 h-16 flex items-center gap-4">
          <button className="p-2 rounded-full bg-brand-card border border-brand-border text-brand-muted hover:text-white transition-colors" onClick={() => setLocation("/driver")}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-brand-muted font-bold mb-0.5">Load #{load.externalLoadId}</p>
            <h1 className="text-base font-bold text-white truncate">{load.brokerName}</h1>
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase shadow-sm ${
            load.status === "IN_TRANSIT" 
              ? "bg-gradient-to-r from-brand-gold-light via-brand-gold to-brand-gold-dark text-[#6b3b05]" 
              : "bg-brand-dark-pill border border-brand-border text-brand-muted"
          }`}>
            {load.status.replace("_", " ")}
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 space-y-6">
        {/* Map Placeholder */}
        <div className="aspect-[16/9] bg-brand-card rounded-2xl border border-brand-border flex items-center justify-center relative overflow-hidden shadow-lg shadow-black/30 group">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#f5c550_1px,transparent_1px)] [background-size:20px_20px]" />
          
          {/* Map Content */}
          <div className="flex flex-col items-center gap-3 text-brand-muted z-10">
            <div className="h-12 w-12 rounded-full bg-brand-dark-pill border border-brand-border flex items-center justify-center shadow-pill-dark">
               <Map className="h-6 w-6 text-brand-gold" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-brand-text/60">Interactive Map View</span>
          </div>
          
          {/* Floating Navigate Button */}
          <div className="absolute bottom-4 right-4 z-20">
            <PillButton variant="gold" size="md" icon={<Navigation className="w-3.5 h-3.5" />}>
               Navigate
            </PillButton>
          </div>
        </div>

        {/* Stops List */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-brand-muted uppercase tracking-widest pl-2">Route Plan</h2>
          <div className="space-y-4">
            {load.stops.map((stop) => (
              <StopRow 
                key={stop.id} 
                stop={stop} 
                onStatusUpdate={handleStopStatusUpdate} 
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
