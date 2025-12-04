import { useRoute, useLocation } from "wouter";
import { getLoadById } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Map, Navigation, Phone, Upload, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";

export default function LoadDetails() {
  const [, params] = useRoute("/driver/loads/:id");
  const [, setLocation] = useLocation();
  const load = getLoadById(params?.id || "");

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

                    {/* Actions if active stop */}
                    {stop.status === "PLANNED" && idx === 0 && load.status === "IN_TRANSIT" && (
                       <div className="flex gap-2 mt-2">
                         <Button size="sm" className="h-8 text-xs flex-1">Mark Arrived</Button>
                         <Button size="sm" variant="outline" className="h-8 text-xs px-2"><Phone className="h-3.5 w-3.5" /></Button>
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
            Update Status
          </Button>
        </div>
      </div>
    </div>
  );
}
