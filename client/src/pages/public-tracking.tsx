import { useRoute } from "wouter";
import { getLoadById } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Map, Package, Truck, Clock, MapPin, Share2 } from "lucide-react";
import { format } from "date-fns";
import { PillButton } from "@/components/ui/pill-button";

// Mock function to decode token (in real app this would be an API call)
const getLoadFromToken = (token: string) => {
  return getLoadById("ld_cuid123456"); 
};

export default function PublicTracking() {
  const [, params] = useRoute("/public/track/:token");
  const load = getLoadFromToken(params?.token || "");

  if (!load) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg text-brand-text">
        <p>Tracking link invalid or expired.</p>
      </div>
    );
  }

  const currentStop = load.stops.find(s => s.status === "PLANNED" || s.status === "EN_ROUTE") || load.stops[load.stops.length - 1];

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text font-sans">
      {/* Top Bar */}
      <nav className="bg-brand-card border-b border-brand-border px-6 py-4 flex justify-between items-center shadow-lg relative z-20">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-gradient-to-br from-brand-gold-light to-brand-gold-dark rounded-lg flex items-center justify-center shadow-pill-gold">
            <Package className="h-5 w-5 text-[#6b3b05]" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight text-white block leading-none">AgentOS</span>
            <span className="text-[10px] uppercase tracking-widest text-brand-muted font-bold">Tracking Core</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full border border-brand-border bg-brand-dark-pill text-brand-muted font-mono text-xs hidden sm:flex">
            REF: {load.externalLoadId}
          </div>
          <PillButton variant="dark" size="md" icon={<Share2 className="w-3 h-3" />} className="hidden sm:flex">
            Share
          </PillButton>
        </div>
      </nav>

      <div className="grid lg:grid-cols-3 h-[calc(100vh-73px)]">
        {/* Map Area (2/3 width on desktop) */}
        <div className="lg:col-span-2 bg-brand-bg relative order-2 lg:order-1 min-h-[300px] border-r border-brand-border">
          <div className="absolute inset-0 flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=2074&auto=format&fit=crop')] bg-cover bg-center opacity-10 grayscale"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-brand-card/90 backdrop-blur-md p-8 rounded-3xl border border-brand-border flex flex-col items-center gap-4 text-center max-w-sm mx-4 shadow-2xl">
              <div className="h-16 w-16 rounded-full bg-brand-dark-pill border border-brand-border flex items-center justify-center shadow-pill-dark relative">
                <div className="absolute inset-0 rounded-full bg-brand-gold/10 animate-ping" />
                <Map className="h-8 w-8 text-brand-gold" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Live Tracking Active</h3>
                <p className="text-sm text-brand-muted mt-2 leading-relaxed">Vehicle location is updated every 15 minutes via secure GPS link.</p>
              </div>
              {load.lastLocationCity && (
                 <div className="mt-2 px-4 py-1.5 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-brand-gold text-xs font-bold tracking-wide uppercase">
                   Near {load.lastLocationCity}, {load.lastLocationState}
                 </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Info (1/3 width) */}
        <div className="bg-brand-card order-1 lg:order-2 overflow-y-auto border-l border-brand-border shadow-2xl relative z-10">
          <div className="p-6 space-y-8">
            {/* Header Info */}
            <div className="space-y-5">
              <div>
                <p className="text-xs text-brand-muted uppercase tracking-widest font-bold mb-2">Current Status</p>
                <div className="flex items-center gap-4">
                  <h1 className="text-3xl font-bold text-white tracking-tight">{load.status.replace("_", " ")}</h1>
                  <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.6)]" />
                </div>
                <p className="text-brand-text/80 mt-3 text-sm leading-relaxed">
                  Your shipment is on schedule. Estimated arrival at destination: <span className="text-brand-gold font-mono">{format(new Date(load.stops[load.stops.length-1].windowStart), "MMM d, h:mm a")}</span>
                </p>
              </div>
            </div>

            {/* Progress Visual */}
            <div className="space-y-4 bg-brand-dark-pill/50 p-4 rounded-2xl border border-brand-border/50">
               <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                 <span>Origin</span>
                 <span>Destination</span>
               </div>
               <div className="h-2 bg-brand-border rounded-full overflow-hidden relative">
                 <div className="absolute inset-y-0 left-0 w-[65%] bg-gradient-to-r from-brand-gold-light to-brand-gold-dark rounded-full shadow-pill-gold" />
               </div>
               <div className="flex items-center justify-between text-sm font-bold text-white">
                 <span>{load.stops[0].city}</span>
                 <span>{load.stops[load.stops.length-1].city}</span>
               </div>
            </div>

            {/* Stop List */}
            <div>
              <p className="text-xs text-brand-muted uppercase tracking-widest font-bold mb-6 pl-2">Route Details</p>
              <div className="space-y-0 relative pl-2">
                <div className="absolute top-2 bottom-4 left-[19px] w-0.5 bg-brand-border" />
                
                {load.stops.map((stop, idx) => {
                   const isCompleted = stop.status === "DEPARTED" || stop.status === "ARRIVED";
                   const isCurrent = stop.id === currentStop?.id;

                   return (
                    <div key={stop.id} className="relative pl-10 pb-10 last:pb-0 group">
                      <div className={`absolute left-[12px] top-1.5 h-4 w-4 rounded-full border-2 z-10 transition-all duration-500 ${
                        isCompleted ? "bg-emerald-500 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" :
                        isCurrent ? "bg-brand-gold border-brand-gold ring-4 ring-brand-gold/20 shadow-[0_0_10px_rgba(245,197,80,0.4)]" :
                        "bg-brand-card border-brand-border"
                      }`}>
                        {isCompleted && <div className="h-full w-full flex items-center justify-center text-brand-card"><div className="h-1.5 w-1.5 bg-brand-card rounded-full" /></div>}
                      </div>
                      
                      <div className={`transition-all duration-500 ${isCurrent ? "opacity-100 translate-x-0" : isCompleted ? "opacity-60" : "opacity-40"}`}>
                        <h4 className="text-base font-bold text-white group-hover:text-brand-gold transition-colors">{stop.city}, {stop.state}</h4>
                        <p className="text-sm text-brand-muted mt-0.5">{stop.addressLine1}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-brand-muted/80 font-mono bg-brand-dark-pill/50 w-fit px-2 py-1 rounded border border-brand-border/50">
                          <Clock className="h-3 w-3" />
                          {format(new Date(stop.windowStart), "MMM d, HH:mm")}
                        </div>
                      </div>
                    </div>
                   );
                })}
              </div>
            </div>
          </div>
          
          {/* Footer Area */}
          <div className="p-6 border-t border-brand-border bg-brand-card/50">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-brand-dark-pill border border-brand-border flex items-center justify-center shrink-0">
                 <Truck className="h-5 w-5 text-brand-muted" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Carrier Information</p>
                <p className="text-xs text-brand-muted mt-1">Transport provided by <span className="text-white font-medium">Soar Transportation Group</span></p>
                <p className="text-[10px] text-brand-muted font-mono mt-2 uppercase tracking-wide">MC: 123456 • DOT: 9876543</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
