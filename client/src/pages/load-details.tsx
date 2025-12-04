import { useRoute, useLocation } from "wouter";
import { getLoadById, Load, Stop } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Map, Navigation, Upload, CheckCircle2, Clock, Play, Square } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { toast } from "sonner";

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

    // Mock API call
    try {
      // In a real app, this would be:
      // await fetch(`/api/tracking/stops/${stopId}/status`, {
      //   method: 'POST',
      //   body: JSON.stringify({ status: newStatus }),
      // });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));

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
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
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

        {/* Stops Timeline */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Route Plan</h2>
          <div className="space-y-0">
            {load.stops.map((stop, idx) => {
              const isLast = idx === load.stops.length - 1;
              const isPast = stop.status === "DEPARTED" || stop.status === "ARRIVED" || stop.status === "SKIPPED";
              const isCompleted = stop.status === "DEPARTED";
              
              // Determine button states
              const showButtons = stop.type === "PICKUP" || stop.type === "DELIVERY";
              const isArriveDisabled = stop.status === "ARRIVED" || stop.status === "DEPARTED";
              const isDepartDisabled = stop.status === "DEPARTED"; // Can depart if ARRIVED or PLANNED/EN_ROUTE (though logically usually after arrive)

              return (
                <div key={stop.id} className="flex gap-4 relative pb-8 last:pb-0">
                  {/* Connector Line */}
                  {!isLast && (
                    <div className={`absolute left-[11px] top-3 bottom-0 w-[2px] ${
                      isPast ? "bg-primary" : "bg-border"
                    }`} />
                  )}
                  
                  {/* Status Dot */}
                  <div className={`relative z-10 h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    stop.status === "DEPARTED" 
                      ? "bg-primary border-primary text-primary-foreground"
                      : stop.status === "ARRIVED"
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background border-muted-foreground/30 text-muted-foreground"
                  }`}>
                    {stop.status === "DEPARTED" || stop.status === "ARRIVED" ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <span className="text-[10px] font-bold">{idx + 1}</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-3 pt-0.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-base">{stop.city}, {stop.state}</h3>
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-border/50 bg-muted/20">
                            {stop.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{stop.addressLine1}</p>
                        {stop.zip && <p className="text-xs text-muted-foreground">{stop.zip}</p>}
                      </div>
                    </div>

                    {/* Time Window */}
                    <div className="flex items-center gap-2 text-xs bg-card border border-border/50 p-2 rounded-md w-fit">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span className="font-mono">
                        {format(new Date(stop.windowStart), "MMM d, HH:mm")} - {format(new Date(stop.windowEnd), "HH:mm")}
                      </span>
                    </div>

                    {/* Action Buttons */}
                    {showButtons && (
                      <div className="flex gap-3 mt-3">
                        <Button 
                          size="sm" 
                          className="h-9 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => handleStopStatusUpdate(stop.id, "ARRIVED")}
                          disabled={isArriveDisabled}
                        >
                          {stop.status === "ARRIVED" || stop.status === "DEPARTED" ? (
                            <>Arrived {stop.arrivedAt && format(new Date(stop.arrivedAt), "HH:mm")}</>
                          ) : (
                            <>
                              <Play className="mr-2 h-3 w-3 fill-current" /> Arrive
                            </>
                          )}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="secondary"
                          className="h-9 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => handleStopStatusUpdate(stop.id, "DEPARTED")}
                          disabled={isDepartDisabled}
                        >
                          {stop.status === "DEPARTED" ? (
                             <>Departed {stop.departedAt && format(new Date(stop.departedAt), "HH:mm")}</>
                          ) : (
                             <>
                               <Square className="mr-2 h-3 w-3 fill-current" /> Departed
                             </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
