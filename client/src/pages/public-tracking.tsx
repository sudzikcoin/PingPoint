import { useRoute } from "wouter";
import { getLoadById } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Map, Package, Truck, Clock, MapPin } from "lucide-react";
import { format } from "date-fns";

// Mock function to decode token (in real app this would be an API call)
// For this mockup, we'll just treat the token as an ID or mapping to ID
const getLoadFromToken = (token: string) => {
  // Mock: simply return the first load for any token for demo purposes
  // or try to match ID if token looks like an ID
  return getLoadById("ld_cuid123456"); 
};

export default function PublicTracking() {
  const [, params] = useRoute("/public/track/:token");
  const load = getLoadFromToken(params?.token || "");

  if (!load) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p>Tracking link invalid or expired.</p>
      </div>
    );
  }

  const currentStop = load.stops.find(s => s.status === "PLANNED" || s.status === "EN_ROUTE") || load.stops[load.stops.length - 1];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Top Bar */}
      <nav className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-blue-600 rounded-md flex items-center justify-center">
            <Package className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">AgentOS Tracking</span>
        </div>
        <Badge variant="outline" className="border-zinc-700 text-zinc-400 font-mono hidden sm:flex">
          REF: {load.externalLoadId}
        </Badge>
      </nav>

      <div className="grid lg:grid-cols-3 h-[calc(100vh-65px)]">
        {/* Map Area (2/3 width on desktop) */}
        <div className="lg:col-span-2 bg-zinc-900/50 relative order-2 lg:order-1 min-h-[300px]">
          <div className="absolute inset-0 flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=2074&auto=format&fit=crop')] bg-cover bg-center opacity-20 grayscale"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-zinc-950/80 backdrop-blur-sm p-6 rounded-xl border border-zinc-800 flex flex-col items-center gap-3 text-center max-w-xs mx-4">
              <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse">
                <Map className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <h3 className="font-medium text-white">Live Tracking Active</h3>
                <p className="text-sm text-zinc-400 mt-1">Vehicle location is updated every 15 minutes.</p>
              </div>
              {load.lastLocationCity && (
                 <Badge className="mt-2 bg-blue-600 hover:bg-blue-700 border-none">
                   Near {load.lastLocationCity}, {load.lastLocationState}
                 </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Info (1/3 width) */}
        <div className="bg-zinc-950 border-l border-zinc-800 order-1 lg:order-2 overflow-y-auto">
          <div className="p-6 space-y-8">
            {/* Header Info */}
            <div className="space-y-4">
              <div>
                <p className="text-sm text-zinc-500 uppercase tracking-wider font-bold mb-1">Current Status</p>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold text-white">{load.status.replace("_", " ")}</h1>
                  <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                </div>
                <p className="text-zinc-400 mt-2 text-sm">
                  Your shipment is on schedule. Estimated arrival at destination: <span className="text-white font-mono">{format(new Date(load.stops[load.stops.length-1].windowStart), "MMM d, h:mm a")}</span>
                </p>
              </div>
            </div>

            {/* Progress Visual */}
            <div className="space-y-4">
               <div className="flex items-center justify-between text-xs font-medium text-zinc-500 uppercase tracking-wider">
                 <span>Origin</span>
                 <span>Destination</span>
               </div>
               <div className="h-2 bg-zinc-800 rounded-full overflow-hidden relative">
                 <div className="absolute inset-y-0 left-0 w-[65%] bg-blue-600 rounded-full" />
               </div>
               <div className="flex items-center justify-between text-sm font-semibold text-white">
                 <span>{load.stops[0].city}</span>
                 <span>{load.stops[load.stops.length-1].city}</span>
               </div>
            </div>

            {/* Stop List */}
            <div>
              <p className="text-sm text-zinc-500 uppercase tracking-wider font-bold mb-4">Route Details</p>
              <div className="space-y-0 relative pl-2">
                <div className="absolute top-2 bottom-4 left-[19px] w-0.5 bg-zinc-800" />
                
                {load.stops.map((stop, idx) => {
                   const isCompleted = stop.status === "DEPARTED" || stop.status === "ARRIVED";
                   const isCurrent = stop.id === currentStop?.id;

                   return (
                    <div key={stop.id} className="relative pl-8 pb-8 last:pb-0">
                      <div className={`absolute left-[12px] top-1.5 h-4 w-4 rounded-full border-2 z-10 transition-colors ${
                        isCompleted ? "bg-emerald-500 border-emerald-500" :
                        isCurrent ? "bg-blue-500 border-blue-500 ring-4 ring-blue-500/20" :
                        "bg-zinc-900 border-zinc-600"
                      }`}>
                        {isCompleted && <div className="h-full w-full flex items-center justify-center text-zinc-950"><div className="h-1.5 w-1.5 bg-zinc-950 rounded-full" /></div>}
                      </div>
                      
                      <div className={`${isCurrent ? "opacity-100" : isCompleted ? "opacity-60" : "opacity-40"}`}>
                        <h4 className="text-base font-semibold text-zinc-100">{stop.city}, {stop.state}</h4>
                        <p className="text-sm text-zinc-400 mt-0.5">{stop.addressLine1}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500 font-mono">
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
          <div className="p-6 border-t border-zinc-800 bg-zinc-900/30">
            <div className="flex items-start gap-3">
              <Truck className="h-5 w-5 text-zinc-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-zinc-300">Carrier Information</p>
                <p className="text-xs text-zinc-500 mt-1">Transport provided by <span className="text-zinc-300">Soar Transportation Group</span></p>
                <p className="text-xs text-zinc-500">MC: 123456 • DOT: 9876543</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
