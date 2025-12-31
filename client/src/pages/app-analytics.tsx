import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { BarChart3, Clock, Package, Leaf, Download, ChevronLeft, ChevronRight, TrendingUp, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface DriverStats {
  driverId: string | null;
  driverName: string | null;
  totalLoads: number;
  deliveredLoads: number;
  onTimeLoads: number;
  lateLoads: number;
  onTimePercent: number;
}

interface ShipperStats {
  shipperId: string | null;
  shipperName: string | null;
  totalLoads: number;
  deliveredLoads: number;
  onTimeLoads: number;
  lateLoads: number;
  onTimePercent: number;
}

interface AnalyticsOverview {
  totalLoads: number;
  deliveredLoads: number;
  onTimeLoads: number;
  lateLoads: number;
  onTimePercent: number;
  avgDelayMinutes: number | null;
  avgPickupDwellMinutes: number | null;
  avgDeliveryDwellMinutes: number | null;
  co2TotalKg: number | null;
  byDrivers: DriverStats[];
  byShippers: ShipperStats[];
  plan: string;
  limited: boolean;
}

interface LoadItem {
  loadId: string;
  loadNumber: string;
  pickupCity?: string;
  deliveryCity?: string;
  plannedDeliveryAt?: string;
  actualDeliveryAt?: string;
  status: string;
  onTime: boolean | null;
  delayMinutes: number | null;
  distanceMiles: number | null;
  co2Kg: number | null;
}

interface LoadsResponse {
  items: LoadItem[];
  page: number;
  limit: number;
  total: number;
  plan: string;
  limited: boolean;
}

type DateRange = '7d' | '30d' | '90d';

export default function AppAnalytics() {
  const { theme } = useTheme();
  const [, setLocation] = useLocation();
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [loadsPage, setLoadsPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'overview' | 'loads'>('overview');

  const getDateRange = () => {
    const to = new Date();
    const from = new Date();
    switch (dateRange) {
      case '7d':
        from.setDate(from.getDate() - 7);
        break;
      case '30d':
        from.setDate(from.getDate() - 30);
        break;
      case '90d':
        from.setDate(from.getDate() - 90);
        break;
    }
    return { from: from.toISOString(), to: to.toISOString() };
  };

  const { from, to } = getDateRange();

  const { data: overview, isLoading: overviewLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview", from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/analytics/overview?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load analytics');
      return res.json();
    },
  });

  const { data: loadsData, isLoading: loadsLoading } = useQuery<LoadsResponse>({
    queryKey: ["/api/analytics/loads", from, to, loadsPage],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to, page: loadsPage.toString(), limit: '25' });
      const res = await fetch(`/api/analytics/loads?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load analytics loads');
      return res.json();
    },
    enabled: activeTab === 'loads',
  });

  const handleExportCsv = () => {
    const params = new URLSearchParams({ from, to });
    window.location.href = `/api/analytics/loads.csv?${params.toString()}`;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const cardClasses = cn(
    "rounded-lg border transition-colors",
    theme === "arcade90s" 
      ? "bg-arc-panel border-arc-border" 
      : "bg-brand-card border-brand-border"
  );

  const tabClasses = (active: boolean) => cn(
    "px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer",
    active 
      ? theme === "arcade90s"
        ? "bg-arc-secondary/20 text-arc-secondary border border-arc-secondary/50"
        : "bg-brand-dark-pill text-white border border-brand-border"
      : theme === "arcade90s"
        ? "text-arc-muted hover:text-arc-text"
        : "text-brand-muted hover:text-white"
  );

  const buttonVariantClasses = cn(
    "h-8 px-3 text-xs font-medium rounded transition-colors",
    theme === "arcade90s"
      ? "bg-arc-bg border border-arc-border text-arc-text hover:border-arc-secondary"
      : "bg-brand-dark-pill border border-brand-border text-white hover:border-brand-gold"
  );

  const buttonActiveClasses = cn(
    "h-8 px-3 text-xs font-medium rounded transition-colors",
    theme === "arcade90s"
      ? "bg-arc-secondary/20 border border-arc-secondary text-arc-secondary"
      : "bg-brand-dark-pill border border-brand-gold text-brand-gold"
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className={cn("text-2xl font-bold", theme === "arcade90s" && "arcade-pixel-font text-arc-primary")}>
            Analytics
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDateRange('7d')}
              className={dateRange === '7d' ? buttonActiveClasses : buttonVariantClasses}
              data-testid="button-7d"
            >
              7 Days
            </button>
            <button
              onClick={() => setDateRange('30d')}
              className={dateRange === '30d' ? buttonActiveClasses : buttonVariantClasses}
              data-testid="button-30d"
            >
              30 Days
            </button>
            <button
              onClick={() => setDateRange('90d')}
              className={dateRange === '90d' ? buttonActiveClasses : buttonVariantClasses}
              data-testid="button-90d"
            >
              90 Days
            </button>
          </div>
        </div>

        {overview?.limited && (
          <div className={cn(
            "flex items-center gap-3 p-3 rounded-lg border",
            theme === "arcade90s"
              ? "bg-arc-secondary/10 border-arc-secondary/30 text-arc-secondary"
              : "bg-brand-gold/10 border-brand-gold/30 text-brand-gold"
          )}>
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">
              You're on the Free plan. Analytics is limited to the last 30 days.{" "}
              <button 
                onClick={() => setLocation('/app/billing')} 
                className="underline hover:no-underline"
                data-testid="link-upgrade"
              >
                Upgrade to Pro
              </button>{" "}
              for full history and detailed breakdowns.
            </span>
          </div>
        )}

        <div className="flex items-center gap-4 border-b border-brand-border/20 pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={tabClasses(activeTab === 'overview')}
            data-testid="tab-overview"
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('loads')}
            className={tabClasses(activeTab === 'loads')}
            data-testid="tab-loads"
          >
            Loads Detail
          </button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className={cn(
              "gap-2",
              theme === "arcade90s" && "arcade-pixel-font text-xs rounded-none border-arc-border hover:border-arc-secondary"
            )}
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        {activeTab === 'overview' && (
          <>
            {overviewLoading ? (
              <div className={cn("text-center py-12", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Loading analytics...
              </div>
            ) : overview ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className={cardClasses}>
                    <div className="p-4">
                      <div className={cn("text-xs uppercase tracking-wide mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        Total Loads
                      </div>
                      <div className={cn("text-2xl font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")} data-testid="text-total-loads">
                        {overview.totalLoads}
                      </div>
                    </div>
                  </div>

                  <div className={cardClasses}>
                    <div className="p-4">
                      <div className={cn("text-xs uppercase tracking-wide mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        On-Time %
                      </div>
                      <div className={cn("text-2xl font-bold", overview.onTimePercent >= 90 ? "text-green-400" : overview.onTimePercent >= 75 ? "text-yellow-400" : "text-red-400")} data-testid="text-ontime-percent">
                        {overview.onTimePercent}%
                      </div>
                    </div>
                  </div>

                  <div className={cardClasses}>
                    <div className="p-4">
                      <div className={cn("text-xs uppercase tracking-wide mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        Avg Delay
                      </div>
                      <div className={cn("text-2xl font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")} data-testid="text-avg-delay">
                        {overview.avgDelayMinutes ?? '-'} <span className="text-sm font-normal">min</span>
                      </div>
                    </div>
                  </div>

                  <div className={cardClasses}>
                    <div className="p-4">
                      <div className={cn("text-xs uppercase tracking-wide mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        Pickup Dwell
                      </div>
                      <div className={cn("text-2xl font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")} data-testid="text-pickup-dwell">
                        {overview.avgPickupDwellMinutes ?? '-'} <span className="text-sm font-normal">min</span>
                      </div>
                    </div>
                  </div>

                  <div className={cardClasses}>
                    <div className="p-4">
                      <div className={cn("text-xs uppercase tracking-wide mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        Delivery Dwell
                      </div>
                      <div className={cn("text-2xl font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")} data-testid="text-delivery-dwell">
                        {overview.avgDeliveryDwellMinutes ?? '-'} <span className="text-sm font-normal">min</span>
                      </div>
                    </div>
                  </div>

                  <div className={cardClasses}>
                    <div className="p-4">
                      <div className={cn("text-xs uppercase tracking-wide mb-1 flex items-center gap-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        <Leaf className="w-3 h-3" /> CO₂ Total
                      </div>
                      <div className={cn("text-2xl font-bold text-green-400")} data-testid="text-co2-total">
                        {overview.co2TotalKg !== null ? `${overview.co2TotalKg.toLocaleString()}` : '-'} <span className="text-sm font-normal">kg</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <Card className={cardClasses}>
                    <CardHeader className="pb-3">
                      <CardTitle className={cn("text-sm font-medium", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white")}>
                        By Driver
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {overview.byDrivers.length === 0 ? (
                        <div className={cn("text-sm py-4 text-center", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                          No driver data available
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className={cn("grid grid-cols-4 text-xs uppercase tracking-wide pb-2 border-b", theme === "arcade90s" ? "text-arc-muted border-arc-border" : "text-brand-muted border-brand-border")}>
                            <div>Driver</div>
                            <div className="text-center">Loads</div>
                            <div className="text-center">On-Time</div>
                            <div className="text-center">Late</div>
                          </div>
                          {overview.byDrivers.map((driver, i) => (
                            <div 
                              key={driver.driverId || i} 
                              className={cn("grid grid-cols-4 text-sm py-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}
                              data-testid={`row-driver-${i}`}
                            >
                              <div className="truncate">{driver.driverName || 'Unassigned'}</div>
                              <div className="text-center">{driver.totalLoads}</div>
                              <div className="text-center text-green-400">{driver.onTimePercent}%</div>
                              <div className="text-center text-red-400">{driver.lateLoads}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className={cardClasses}>
                    <CardHeader className="pb-3">
                      <CardTitle className={cn("text-sm font-medium", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white")}>
                        By Shipper
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {overview.byShippers.length === 0 ? (
                        <div className={cn("text-sm py-4 text-center", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                          No shipper data available
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className={cn("grid grid-cols-4 text-xs uppercase tracking-wide pb-2 border-b", theme === "arcade90s" ? "text-arc-muted border-arc-border" : "text-brand-muted border-brand-border")}>
                            <div>Shipper</div>
                            <div className="text-center">Loads</div>
                            <div className="text-center">On-Time</div>
                            <div className="text-center">Late</div>
                          </div>
                          {overview.byShippers.map((shipper, i) => (
                            <div 
                              key={shipper.shipperName || i} 
                              className={cn("grid grid-cols-4 text-sm py-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}
                              data-testid={`row-shipper-${i}`}
                            >
                              <div className="truncate">{shipper.shipperName}</div>
                              <div className="text-center">{shipper.totalLoads}</div>
                              <div className="text-center text-green-400">{shipper.onTimePercent}%</div>
                              <div className="text-center text-red-400">{shipper.lateLoads}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <div className={cn("text-center py-12", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Failed to load analytics
              </div>
            )}
          </>
        )}

        {activeTab === 'loads' && (
          <>
            {loadsLoading ? (
              <div className={cn("text-center py-12", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Loading loads...
              </div>
            ) : loadsData ? (
              <div className="space-y-4">
                <div className={cn("overflow-x-auto rounded-lg border", theme === "arcade90s" ? "border-arc-border" : "border-brand-border")}>
                  <table className="w-full text-sm">
                    <thead className={cn(theme === "arcade90s" ? "bg-arc-bg text-arc-muted" : "bg-brand-dark-pill text-brand-muted")}>
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Load #</th>
                        <th className="text-left px-4 py-3 font-medium">Route</th>
                        <th className="text-left px-4 py-3 font-medium">Planned</th>
                        <th className="text-left px-4 py-3 font-medium">Actual</th>
                        <th className="text-center px-4 py-3 font-medium">On-Time</th>
                        <th className="text-right px-4 py-3 font-medium">Delay</th>
                        <th className="text-right px-4 py-3 font-medium">Miles</th>
                        <th className="text-right px-4 py-3 font-medium">CO₂ (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadsData.items.map((load, i) => (
                        <tr 
                          key={load.loadId}
                          className={cn(
                            "border-t cursor-pointer hover:bg-brand-dark-pill/50",
                            theme === "arcade90s" ? "border-arc-border text-arc-text" : "border-brand-border text-white"
                          )}
                          onClick={() => setLocation(`/app/loads/${load.loadId}`)}
                          data-testid={`row-load-${i}`}
                        >
                          <td className="px-4 py-3 font-medium">{load.loadNumber}</td>
                          <td className="px-4 py-3">{load.pickupCity || '-'} → {load.deliveryCity || '-'}</td>
                          <td className="px-4 py-3">{formatDate(load.plannedDeliveryAt)}</td>
                          <td className="px-4 py-3">{formatDate(load.actualDeliveryAt)}</td>
                          <td className="px-4 py-3 text-center">
                            {load.onTime === null ? (
                              <span className="text-brand-muted">-</span>
                            ) : load.onTime ? (
                              <span className="text-green-400">✓</span>
                            ) : (
                              <span className="text-red-400">✗</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">{load.delayMinutes ?? '-'}</td>
                          <td className="px-4 py-3 text-right">{load.distanceMiles ?? '-'}</td>
                          <td className="px-4 py-3 text-right">{load.co2Kg ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between">
                  <div className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                    Showing {((loadsPage - 1) * loadsData.limit) + 1} - {Math.min(loadsPage * loadsData.limit, loadsData.total)} of {loadsData.total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLoadsPage(p => Math.max(1, p - 1))}
                      disabled={loadsPage === 1}
                      className={theme === "arcade90s" ? "rounded-none" : ""}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLoadsPage(p => p + 1)}
                      disabled={loadsPage * loadsData.limit >= loadsData.total}
                      className={theme === "arcade90s" ? "rounded-none" : ""}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className={cn("text-center py-12", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Failed to load data
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
