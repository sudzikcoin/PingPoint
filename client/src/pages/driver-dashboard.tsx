import { useState } from "react";
import { useLocation } from "wouter";
import { getLoadsByView } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Truck, ChevronRight, Navigation } from "lucide-react";
import { format } from "date-fns";

export default function DriverDashboard() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"today" | "upcoming" | "history">("today");

  const loads = getLoadsByView(activeTab);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">My Loads</h1>
            <p className="text-xs text-muted-foreground">Driver: John Doe</p>
          </div>
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs ring-2 ring-primary/20">
            JD
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Status Tabs */}
        <Tabs defaultValue="today" onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1">
            <TabsTrigger value="today" className="text-xs font-medium">Today</TabsTrigger>
            <TabsTrigger value="upcoming" className="text-xs font-medium">Upcoming</TabsTrigger>
            <TabsTrigger value="history" className="text-xs font-medium">History</TabsTrigger>
          </TabsList>

          <div className="mt-6 space-y-4">
            {loads.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Truck className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium">No loads found</h3>
                <p className="text-xs text-muted-foreground mt-1">You have no loads in this category.</p>
              </div>
            ) : (
              loads.map((load) => (
                <Card 
                  key={load.id} 
                  className="overflow-hidden border-border/50 bg-card/50 hover:bg-card/80 transition-colors cursor-pointer active:scale-[0.99] transition-transform"
                  onClick={() => setLocation(`/driver/loads/${load.id}`)}
                >
                  <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between space-y-0">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={load.status === "IN_TRANSIT" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0.5 h-5">
                          {load.status.replace("_", " ")}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground">{load.externalLoadId}</span>
                      </div>
                      <CardTitle className="text-sm font-medium leading-none truncate max-w-[200px]">
                        {load.brokerName}
                      </CardTitle>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="p-4 pt-2 space-y-4">
                    {/* Route Visualization */}
                    <div className="relative pl-4 border-l border-border/50 space-y-6 my-2">
                      {load.stops.map((stop, idx) => (
                        <div key={stop.id} className="relative">
                          <div className={`absolute -left-[21px] top-0 h-2.5 w-2.5 rounded-full ring-4 ring-background ${
                            idx === 0 ? "bg-emerald-500" : idx === load.stops.length - 1 ? "bg-rose-500" : "bg-primary"
                          }`} />
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold">{stop.city}, {stop.state}</p>
                            <p className="text-[10px] text-muted-foreground">{format(new Date(stop.windowStart), "MMM d, h:mm a")}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {load.lastLocationCity && (
                      <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 p-2 rounded-md">
                        <Navigation className="h-3 w-3" />
                        <span>Last ping: {load.lastLocationCity}, {load.lastLocationState}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </Tabs>
      </main>
    </div>
  );
}
