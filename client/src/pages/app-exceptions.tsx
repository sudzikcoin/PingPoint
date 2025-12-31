import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, Radio, Timer, Eye, CheckCircle, RefreshCw } from "lucide-react";
import { BackToLoadsButton } from "@/components/ui/back-to-loads-button";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "sonner";

interface ExceptionData {
  id: string;
  loadId: string;
  loadNumber: string;
  type: 'LATE' | 'NO_SIGNAL' | 'LONG_DWELL';
  detectedAt: string;
  lastPingAt: string | null;
  status: string;
  shipperName: string | null;
  receiverName: string | null;
  details: Record<string, unknown> | null;
}

interface ExceptionsResponse {
  exceptions: ExceptionData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type ExceptionType = '' | 'LATE' | 'NO_SIGNAL' | 'LONG_DWELL';

const typeLabels: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  'LATE': { label: 'Late', icon: Clock, color: 'text-red-400 bg-red-500/20' },
  'NO_SIGNAL': { label: 'No Signal', icon: Radio, color: 'text-yellow-400 bg-yellow-500/20' },
  'LONG_DWELL': { label: 'Long Dwell', icon: Timer, color: 'text-orange-400 bg-orange-500/20' },
};

export default function AppExceptions() {
  const { theme } = useTheme();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<ExceptionType>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<ExceptionsResponse>({
    queryKey: ["/api/loads/exceptions", typeFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      params.set('page', page.toString());
      params.set('limit', '25');
      const res = await fetch(`/api/loads/exceptions?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load exceptions');
      return res.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ loadId, type }: { loadId: string; type?: string }) => {
      const res = await fetch(`/api/loads/${loadId}/exceptions/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error('Failed to resolve exception');
      return res.json();
    },
    onSuccess: () => {
      toast.success("Exception resolved");
      queryClient.invalidateQueries({ queryKey: ["/api/loads/exceptions"] });
    },
    onError: () => {
      toast.error("Failed to resolve exception");
    },
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatTimeSince = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const inputClasses = cn(
    "w-full h-10 px-3 py-2 border rounded-md text-sm",
    theme === "arcade90s" 
      ? "bg-arc-bg border-arc-border text-arc-text rounded-none focus:border-arc-secondary" 
      : "bg-brand-dark-pill border-brand-border text-white"
  );

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BackToLoadsButton />
            <div>
              <h1 className={cn("text-2xl font-bold", theme === "arcade90s" ? "arcade-title arcade-pixel-font" : "text-white")}>
                Exceptions
              </h1>
              <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted")}>
                Loads requiring attention
              </p>
            </div>
          </div>
          <Button 
            data-testid="button-refresh-exceptions"
            onClick={() => refetch()} 
            variant="outline"
            size="sm"
            className={cn(theme === "arcade90s" ? "border-arc-border text-arc-text" : "")}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                <AlertTriangle className="w-4 h-4" /> Active Exceptions
                {data && <span className="ml-2 text-xs opacity-60">({data.total})</span>}
              </CardTitle>
              <div className="flex items-center gap-2">
                <label className={cn("text-xs", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Filter:
                </label>
                <select 
                  data-testid="select-exception-type"
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value as ExceptionType);
                    setPage(1);
                  }}
                  className={cn(inputClasses, "w-36")}
                >
                  <option value="">All Types</option>
                  <option value="LATE">Late</option>
                  <option value="NO_SIGNAL">No Signal</option>
                  <option value="LONG_DWELL">Long Dwell</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>
                  Loading exceptions...
                </div>
              </div>
            ) : !data?.exceptions.length ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <CheckCircle className={cn("w-8 h-8 mb-2", theme === "arcade90s" ? "text-arc-secondary" : "text-green-500")} />
                <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  No active exceptions. All loads are on track!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={cn("border-b text-xs uppercase tracking-wider", theme === "arcade90s" ? "border-arc-border text-arc-muted" : "border-brand-border text-brand-muted")}>
                      <th className="text-left py-3 px-2">Load #</th>
                      <th className="text-left py-3 px-2">Type</th>
                      <th className="text-left py-3 px-2">Detected</th>
                      <th className="text-left py-3 px-2">Last Ping</th>
                      <th className="text-left py-3 px-2">Status</th>
                      <th className="text-left py-3 px-2">Route</th>
                      <th className="text-right py-3 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.exceptions.map((exc) => {
                      const typeInfo = typeLabels[exc.type] || { label: exc.type, icon: AlertTriangle, color: 'text-gray-400 bg-gray-500/20' };
                      const TypeIcon = typeInfo.icon;
                      return (
                        <tr 
                          key={exc.id} 
                          data-testid={`row-exception-${exc.id}`}
                          className={cn("border-b transition-colors", theme === "arcade90s" ? "border-arc-border/50 hover:bg-arc-bg/50" : "border-brand-border/50 hover:bg-brand-dark-pill/30")}
                        >
                          <td className="py-3 px-2">
                            <span className={cn("font-mono text-sm", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")}>
                              {exc.loadNumber}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium", typeInfo.color)}>
                              <TypeIcon className="w-3 h-3" />
                              {typeInfo.label}
                            </span>
                          </td>
                          <td className={cn("py-3 px-2 text-sm", theme === "arcade90s" ? "text-arc-text" : "text-brand-text")}>
                            {formatDate(exc.detectedAt)}
                          </td>
                          <td className={cn("py-3 px-2 text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                            {formatTimeSince(exc.lastPingAt)}
                          </td>
                          <td className={cn("py-3 px-2 text-sm", theme === "arcade90s" ? "text-arc-text" : "text-brand-text")}>
                            {exc.status}
                          </td>
                          <td className={cn("py-3 px-2 text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                            {exc.shipperName && exc.receiverName 
                              ? `${exc.shipperName} → ${exc.receiverName}`
                              : exc.shipperName || '-'}
                          </td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button 
                                data-testid={`button-view-load-${exc.loadId}`}
                                variant="ghost" 
                                size="sm"
                                onClick={() => setLocation(`/app/loads/${exc.loadId}`)}
                                className={cn("text-xs", theme === "arcade90s" ? "text-arc-secondary hover:bg-arc-bg" : "text-brand-gold")}
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                View
                              </Button>
                              <Button 
                                data-testid={`button-resolve-${exc.id}`}
                                variant="outline" 
                                size="sm"
                                onClick={() => resolveMutation.mutate({ loadId: exc.loadId, type: exc.type })}
                                disabled={resolveMutation.isPending}
                                className={cn("text-xs", theme === "arcade90s" ? "border-arc-border text-arc-text hover:bg-arc-secondary hover:text-black" : "")}
                              >
                                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                Resolve
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-brand-border/50">
                <div className={cn("text-xs", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Page {data.page} of {data.totalPages}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                    disabled={page >= data.totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
