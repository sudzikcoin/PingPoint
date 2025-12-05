import { useState } from "react";
import { useLocation } from "wouter";
import { getLoadsByView } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Truck, ChevronRight, Navigation, Calendar, MapPin } from "lucide-react";
import { format } from "date-fns";
import { PillButton } from "@/components/ui/pill-button";

export default function DriverDashboard() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"today" | "upcoming" | "history">("today");

  const loads = getLoadsByView(activeTab);

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text pb-20 font-sans">
      {/* Header */}
      <header className="w-full mb-3">
        <div
          className="
            metal-header
            mx-[-1rem]
            px-4
            py-5
            rounded-b-3xl
            flex flex-col items-center justify-center
            shadow-pill-dark/50
          "
        >
          <h1 className="metal-engraved-main text-xl sm:text-2xl md:text-3xl text-center">
            TRACKING CORE
          </h1>
          <p className="metal-engraved-sub mt-1 text-[10px] sm:text-xs text-center">
            BY SUVERSE LABS
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Status Tabs */}
        <Tabs defaultValue="today" onValueChange={(v) => setActiveTab(v as any)} className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-3 bg-brand-card p-1 rounded-full border border-brand-border">
            <TabsTrigger 
              value="today" 
              className="rounded-full text-xs font-medium data-[state=active]:bg-brand-gold data-[state=active]:text-[#6b3b05] data-[state=active]:shadow-md transition-all duration-300"
            >
              Today
            </TabsTrigger>
            <TabsTrigger 
              value="upcoming" 
              className="rounded-full text-xs font-medium data-[state=active]:bg-brand-gold data-[state=active]:text-[#6b3b05] data-[state=active]:shadow-md transition-all duration-300"
            >
              Upcoming
            </TabsTrigger>
            <TabsTrigger 
              value="history" 
              className="rounded-full text-xs font-medium data-[state=active]:bg-brand-gold data-[state=active]:text-[#6b3b05] data-[state=active]:shadow-md transition-all duration-300"
            >
              History
            </TabsTrigger>
          </TabsList>

          <div className="mt-6 space-y-4">
            {loads.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto h-16 w-16 rounded-full bg-brand-card border border-brand-border flex items-center justify-center mb-4 shadow-pill-dark">
                  <Truck className="h-8 w-8 text-brand-muted" />
                </div>
                <h3 className="text-lg font-medium text-brand-text">No loads found</h3>
                <p className="text-sm text-brand-muted mt-1">You have no loads in this category.</p>
              </div>
            ) : (
              loads.map((load) => (
                <Card 
                  key={load.id} 
                  className="overflow-hidden border-brand-border bg-brand-card shadow-lg shadow-black/20 hover:border-brand-gold/30 transition-all duration-300 cursor-pointer group"
                  onClick={() => setLocation(`/driver/loads/${load.id}`)}
                >
                  <CardHeader className="p-5 pb-3 flex flex-row items-start justify-between space-y-0">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase shadow-sm ${
                          load.status === "IN_TRANSIT" 
                            ? "bg-gradient-to-r from-brand-gold-light via-brand-gold to-brand-gold-dark text-[#6b3b05]" 
                            : "bg-brand-dark-pill border border-brand-border text-brand-muted"
                        }`}>
                          {load.status.replace("_", " ")}
                        </div>
                        <span className="text-xs font-mono text-brand-muted tracking-wider">{load.externalLoadId}</span>
                      </div>
                      <CardTitle className="text-base font-bold leading-tight text-white group-hover:text-brand-gold transition-colors">
                        {load.brokerName}
                      </CardTitle>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-brand-dark-pill border border-brand-border flex items-center justify-center group-hover:bg-brand-gold group-hover:text-[#6b3b05] transition-all duration-300">
                       <ChevronRight className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 pt-2 space-y-5">
                    {/* Route Visualization */}
                    <div className="relative pl-4 border-l border-brand-border space-y-6 my-2 ml-2">
                      {load.stops.map((stop, idx) => (
                        <div key={stop.id} className="relative">
                          <div className={`absolute -left-[21px] top-1 h-3 w-3 rounded-full ring-4 ring-brand-card shadow-md ${
                            idx === 0 ? "bg-emerald-500" : idx === load.stops.length - 1 ? "bg-brand-gold" : "bg-brand-border"
                          }`} />
                          <div className="space-y-1">
                            <div className="flex items-baseline justify-between">
                              <p className="text-sm font-semibold text-brand-text">{stop.city}, {stop.state}</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-brand-muted">
                              <Calendar className="h-3 w-3" />
                              <span>{format(new Date(stop.windowStart), "MMM d, h:mm a")}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {load.lastLocationCity && (
                      <div className="flex items-center gap-3 text-xs text-brand-gold bg-brand-gold/5 p-3 rounded-xl border border-brand-gold/10">
                        <Navigation className="h-3.5 w-3.5" />
                        <span className="font-medium tracking-wide">Last ping: {load.lastLocationCity}, {load.lastLocationState}</span>
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
