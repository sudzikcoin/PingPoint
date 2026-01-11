import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Copy, Search, Filter, ChevronRight, Menu, X, Settings, CloudLightning, Truck, Mail, FileText, Paperclip, Upload, Loader2, Download } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/theme-context";
import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { api, type BrokerWorkspace } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LoadFilters {
  dateFrom: string;
  dateTo: string;
  shipper: string;
  receiver: string;
  loadNumber: string;
  minRate: string;
  maxRate: string;
  address: string;
}

const emptyFilters: LoadFilters = {
  dateFrom: "",
  dateTo: "",
  shipper: "",
  receiver: "",
  loadNumber: "",
  minRate: "",
  maxRate: "",
  address: "",
};

interface Entitlements {
  plan: string;
  loadsUsedThisCycle: number;
  loadsLimitThisCycle: number;
  loadsRemainingThisCycle: number;
  canCreateLoad: boolean;
  creditsBalance: number;
  cycleEndsAt: string | null;
}

export default function AppLoads() {
  const [, setLocation] = useLocation();
  const { theme } = useTheme();
  const [broker, setBroker] = useState<BrokerWorkspace | null>(null);
  const [loads, setLoads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoadId, setUploadLoadId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filters, setFilters] = useState<LoadFilters>(emptyFilters);
  const [activeFilters, setActiveFilters] = useState<LoadFilters>(emptyFilters);
  const hasActiveFilters = Object.values(activeFilters).some(v => v !== "");

  const fetchEntitlements = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/entitlements", {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data: Entitlements = await res.json();
        setEntitlements(data);
        localStorage.removeItem("pp_loadLimitReached");
      }
    } catch (error) {
      console.error("Error fetching entitlements:", error);
    }
  }, []);

  const loadLimitReached = entitlements === null ? true : !entitlements.canCreateLoad;
  const entitlementsLoading = entitlements === null;

  const fetchLoads = useCallback(async (appliedFilters?: LoadFilters) => {
    try {
      const params = new URLSearchParams();
      const f = appliedFilters || activeFilters;
      if (f.dateFrom) params.set("dateFrom", f.dateFrom);
      if (f.dateTo) params.set("dateTo", f.dateTo);
      if (f.shipper) params.set("shipper", f.shipper);
      if (f.receiver) params.set("receiver", f.receiver);
      if (f.loadNumber) params.set("loadNumber", f.loadNumber);
      if (f.minRate) params.set("minRate", f.minRate);
      if (f.maxRate) params.set("maxRate", f.maxRate);
      if (f.address) params.set("address", f.address);

      const queryString = params.toString();
      const url = queryString ? `/api/loads?${queryString}` : "/api/loads";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch loads");
      const data = await res.json();
      setLoads(data.items || []);
    } catch (error) {
      console.error("Error fetching loads:", error);
      toast.error("Failed to load data");
    }
  }, [activeFilters]);

  const handleResendVerification = useCallback(async () => {
    if (!broker) return;
    setResendingEmail(true);
    try {
      await api.brokers.sendVerification(broker.id);
      toast.success("Verification email sent! Check your inbox.");
    } catch (error) {
      toast.error("Failed to send verification email");
    } finally {
      setResendingEmail(false);
    }
  }, [broker]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const brokerData = await api.brokers.me();
        setBroker(brokerData);
        setShowVerificationBanner(!brokerData.emailVerified);
        await Promise.all([fetchLoads(), fetchEntitlements()]);
      } catch (error) {
        console.log("No active session - showing demo view");
        setBroker(null);
        setLoads([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [fetchEntitlements]);

  const handleApplyFilters = async () => {
    setActiveFilters({ ...filters });
    await fetchLoads(filters);
    setShowFilterPanel(false);
  };

  const handleClearFilters = async () => {
    setFilters(emptyFilters);
    setActiveFilters(emptyFilters);
    await fetchLoads(emptyFilters);
    setShowFilterPanel(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setUploadFile(file);
    }
  };

  const handleUploadRateConfirmation = async () => {
    if (!uploadFile) {
      toast.error("Please select a file");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      if (uploadLoadId && uploadLoadId !== "none") {
        formData.append("loadId", uploadLoadId);
      }

      const res = await fetch("/api/rate-confirmations", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to upload");
      }

      toast.success("Rate confirmation uploaded");
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadLoadId("");
      await fetchLoads();
    } catch (error: any) {
      toast.error(error.message || "Failed to upload rate confirmation");
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadRC = async (e: React.MouseEvent, loadId: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/loads/${loadId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to get load");
      const loadData = await res.json();
      if (loadData.rateConfirmationFile?.id) {
        window.open(`/api/rate-confirmations/${loadData.rateConfirmationFile.id}/download`, "_blank");
      }
    } catch (error) {
      toast.error("Failed to download rate confirmation");
    }
  };

  const myLoads = loads;

  const inputClasses = cn(
    "w-full px-3 py-2 text-sm border rounded",
    theme === "arcade90s" 
      ? "bg-arc-bg border-arc-border text-arc-text rounded-none font-mono" 
      : "bg-brand-bg border-brand-border text-white"
  );

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        
        {showVerificationBanner && broker && (
          <div className={cn(
            "relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-lg border mb-6",
            theme === "arcade90s" 
              ? "bg-arc-panel border-arc-secondary/50 shadow-[0_0_15px_rgba(34,211,238,0.2)] arcade-scanline" 
              : "bg-brand-card border-brand-gold/30"
          )}>
            <div className="flex items-center gap-3 flex-1">
              <div className={cn("w-2 h-2 rounded-full animate-pulse shrink-0", theme === "arcade90s" ? "bg-arc-secondary" : "bg-brand-gold")} />
              <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-text arcade-pixel-font text-xs tracking-wide" : "text-brand-text")}>
                We've sent a verification link to <span className={theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold"}>{broker.email}</span>. Please confirm your email to fully activate your workspace.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={handleResendVerification}
                disabled={resendingEmail}
                size="sm"
                variant="outline"
                className={cn(
                  "text-xs",
                  theme === "arcade90s" 
                    ? "border-arc-secondary text-arc-secondary hover:bg-arc-secondary/10 rounded-none arcade-pixel-font" 
                    : "border-brand-gold text-brand-gold hover:bg-brand-gold/10"
                )}
              >
                <Mail className="w-3 h-3 mr-1" />
                {resendingEmail ? "Sending..." : "Resend"}
              </Button>
              <button onClick={() => setShowVerificationBanner(false)} className="p-1 hover:opacity-70">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className={cn(
          "relative p-6 rounded-xl border overflow-hidden",
          theme === "arcade90s" 
            ? "bg-arc-panel border-arc-border shadow-[0_0_30px_rgba(250,204,21,0.1)]" 
            : "bg-brand-card border-brand-border"
        )}>
          {theme === "arcade90s" && (
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)50%,rgba(0,0,0,0.25)50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 bg-[length:100%_2px,3px_100%]" />
          )}
          
          <div className="relative z-10 flex justify-between items-start">
            <div>
              <div className={cn("text-[10px] font-bold uppercase tracking-[0.3em] mb-2", theme === "arcade90s" ? "text-arc-secondary arcade-pixel-font" : "text-brand-muted")}>
                Broker Console
              </div>
              <h1 className={cn("text-3xl md:text-4xl font-bold mb-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font landing-neon" : "text-white")}>
                Welcome, {broker?.name || "Broker"}
              </h1>
              <p className={cn("text-sm max-w-xl", theme === "arcade90s" ? "text-arc-muted font-mono text-xs" : "text-brand-muted")}>
                Here is the list of your active and recent loads. Manage assignments and track status in real-time.
              </p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={cn(theme === "arcade90s" ? "text-arc-primary hover:text-arc-secondary hover:bg-arc-secondary/10 hover:shadow-arc-glow-cyan rounded-none" : "text-brand-muted hover:text-white")}>
                  <Menu className="w-6 h-6" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={cn(
                "w-56",
                theme === "arcade90s" 
                  ? "bg-arc-panel border-arc-secondary text-arc-text rounded-none shadow-[0_0_20px_rgba(34,211,238,0.3)]" 
                  : "bg-brand-card border-brand-border text-brand-text"
              )}>
                <DropdownMenuLabel className={cn(theme === "arcade90s" ? "text-arc-muted arcade-pixel-font text-[10px] tracking-widest uppercase" : "text-brand-muted")}>System Menu</DropdownMenuLabel>
                <DropdownMenuSeparator className={cn(theme === "arcade90s" ? "bg-arc-border" : "bg-brand-border")} />
                
                <DropdownMenuItem 
                  onClick={() => setLocation("/app/loads")}
                  className={cn(theme === "arcade90s" ? "focus:bg-arc-secondary/20 focus:text-arc-secondary arcade-pixel-font text-xs cursor-pointer" : "cursor-pointer")}
                >
                  <Truck className="mr-2 h-4 w-4" />
                  <span>Your Loads</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                  onClick={() => setLocation("/app/billing")}
                  className={cn(theme === "arcade90s" ? "focus:bg-arc-secondary/20 focus:text-arc-secondary arcade-pixel-font text-xs cursor-pointer" : "cursor-pointer")}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Billing</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                  onClick={() => setLocation("/app/settings")}
                  className={cn(theme === "arcade90s" ? "focus:bg-arc-secondary/20 focus:text-arc-secondary arcade-pixel-font text-xs cursor-pointer" : "cursor-pointer")}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                  onClick={() => setLocation("/app/integrations")}
                  className={cn(theme === "arcade90s" ? "focus:bg-arc-secondary/20 focus:text-arc-secondary arcade-pixel-font text-xs cursor-pointer" : "cursor-pointer")}
                >
                  <CloudLightning className="mr-2 h-4 w-4" />
                  <span>Integrations</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className={cn(theme === "arcade90s" ? "bg-arc-border" : "bg-brand-border")} />
                
                {broker ? (
                  <DropdownMenuItem 
                    onClick={async () => {
                      try {
                        await api.brokers.logout();
                        setLocation("/login");
                      } catch (e) {
                        toast.error("Failed to logout");
                      }
                    }}
                    className={cn(theme === "arcade90s" ? "focus:bg-arc-secondary/20 focus:text-arc-secondary arcade-pixel-font text-xs cursor-pointer text-red-400" : "cursor-pointer text-red-400")}
                  >
                    <X className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem 
                    onClick={() => setLocation("/login")}
                    className={cn(theme === "arcade90s" ? "focus:bg-arc-secondary/20 focus:text-arc-secondary arcade-pixel-font text-xs cursor-pointer" : "cursor-pointer")}
                  >
                    <X className="mr-2 h-4 w-4" />
                    <span>Login</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <Button 
              onClick={() => !loadLimitReached && setLocation("/app/loads/new")}
              disabled={loadLimitReached}
              className={cn(
                "h-12 px-6 text-sm font-bold uppercase tracking-wider transition-all",
                loadLimitReached 
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:-translate-y-0.5 active:translate-y-0",
                theme === "arcade90s" 
                  ? "bg-arc-primary text-black rounded-none border border-arc-primary shadow-arc-glow-yellow hover:bg-arc-primary/90 arcade-pixel-font" 
                  : "bg-brand-gold text-black hover:bg-brand-gold/90 rounded-full"
              )}
              data-testid="button-create-load"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Load
            </Button>
            {loadLimitReached && (
              <div className={cn("text-xs", theme === "arcade90s" ? "text-red-400 arcade-pixel-font" : "text-red-400")}>
                Free plan limit reached (3 loads/month).{" "}
                <button 
                  onClick={() => setLocation("/app/billing")}
                  className="underline hover:text-red-300"
                >
                  Upgrade or buy extra loads
                </button>
              </div>
            )}
          </div>
          
          <Button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className={cn(
              "h-12 px-6 text-sm font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 active:translate-y-0",
              theme === "arcade90s"
                ? "bg-cyan-500 text-black rounded-none border border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)] hover:bg-cyan-400 arcade-pixel-font"
                : "bg-cyan-600 text-white hover:bg-cyan-500 shadow-md rounded-full"
            )}
            data-testid="button-upload-rc"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Rate Confirmation
          </Button>

          <div className="flex-1" />

          <Button 
            variant="outline" 
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={cn(
              theme === "arcade90s" ? "border-arc-border text-arc-muted bg-arc-bg rounded-none hover:text-arc-text" : "border-brand-border bg-brand-card text-brand-muted hover:text-white",
              hasActiveFilters && (theme === "arcade90s" ? "border-arc-secondary text-arc-secondary" : "border-brand-gold text-brand-gold")
            )}
            data-testid="button-filter"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filter {hasActiveFilters && "(Active)"}
          </Button>
        </div>

        {showFilterPanel && (
          <Card className={cn(
            "p-4 space-y-4",
            theme === "arcade90s" ? "bg-arc-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border"
          )}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className={cn("text-xs font-medium uppercase tracking-wide mb-1 block", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Date From
                </label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  className={inputClasses}
                  data-testid="input-filter-date-from"
                />
              </div>
              <div>
                <label className={cn("text-xs font-medium uppercase tracking-wide mb-1 block", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Date To
                </label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  className={inputClasses}
                  data-testid="input-filter-date-to"
                />
              </div>
              <div>
                <label className={cn("text-xs font-medium uppercase tracking-wide mb-1 block", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Shipper
                </label>
                <Input
                  placeholder="Shipper name..."
                  value={filters.shipper}
                  onChange={(e) => setFilters({ ...filters, shipper: e.target.value })}
                  className={inputClasses}
                  data-testid="input-filter-shipper"
                />
              </div>
              <div>
                <label className={cn("text-xs font-medium uppercase tracking-wide mb-1 block", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Carrier/Receiver
                </label>
                <Input
                  placeholder="Carrier name..."
                  value={filters.receiver}
                  onChange={(e) => setFilters({ ...filters, receiver: e.target.value })}
                  className={inputClasses}
                  data-testid="input-filter-receiver"
                />
              </div>
              <div>
                <label className={cn("text-xs font-medium uppercase tracking-wide mb-1 block", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Load Number
                </label>
                <Input
                  placeholder="LD-2025-..."
                  value={filters.loadNumber}
                  onChange={(e) => setFilters({ ...filters, loadNumber: e.target.value })}
                  className={inputClasses}
                  data-testid="input-filter-load-number"
                />
              </div>
              <div>
                <label className={cn("text-xs font-medium uppercase tracking-wide mb-1 block", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Min Rate ($)
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={filters.minRate}
                  onChange={(e) => setFilters({ ...filters, minRate: e.target.value })}
                  className={inputClasses}
                  data-testid="input-filter-min-rate"
                />
              </div>
              <div>
                <label className={cn("text-xs font-medium uppercase tracking-wide mb-1 block", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Max Rate ($)
                </label>
                <Input
                  type="number"
                  placeholder="10000"
                  value={filters.maxRate}
                  onChange={(e) => setFilters({ ...filters, maxRate: e.target.value })}
                  className={inputClasses}
                  data-testid="input-filter-max-rate"
                />
              </div>
              <div>
                <label className={cn("text-xs font-medium uppercase tracking-wide mb-1 block", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Address
                </label>
                <Input
                  placeholder="City, state, or address..."
                  value={filters.address}
                  onChange={(e) => setFilters({ ...filters, address: e.target.value })}
                  className={inputClasses}
                  data-testid="input-filter-address"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className={cn(theme === "arcade90s" ? "rounded-none border-arc-border" : "")}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
              <Button
                onClick={handleApplyFilters}
                className={cn(
                  theme === "arcade90s" 
                    ? "bg-arc-secondary text-black rounded-none hover:bg-arc-secondary/80" 
                    : "bg-brand-gold text-black hover:bg-brand-gold/80"
                )}
                data-testid="button-apply-filters"
              >
                Apply Filters
              </Button>
            </div>
          </Card>
        )}

        <div className={cn(
          "rounded-xl overflow-hidden border min-h-[400px]",
          theme === "arcade90s" 
            ? "bg-arc-bg border-arc-border arcade-panel" 
            : "bg-brand-card border-brand-border shadow-lg"
        )}>
          <div className={cn(
            "px-6 py-4 border-b flex items-center justify-between",
            theme === "arcade90s" ? "bg-arc-panel border-arc-border" : "bg-brand-card border-brand-border"
          )}>
            <h3 className={cn("font-bold uppercase tracking-widest text-sm", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-brand-text")}>
              Your Loads
            </h3>
            <div className={cn("text-xs", theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted")}>
              {myLoads.length} {hasActiveFilters ? "Filtered" : "Active"}
            </div>
          </div>

          {myLoads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center p-8">
              <div className={cn("mb-4 p-4 rounded-full", theme === "arcade90s" ? "bg-arc-panel border border-arc-secondary/30" : "bg-brand-dark-pill")}>
                <Truck className={cn("w-8 h-8", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")} />
              </div>
              <p className={cn("mb-2", theme === "arcade90s" ? "text-arc-text arcade-pixel-font text-xs" : "text-white")}>
                {hasActiveFilters ? "No loads match your filters" : "No missions detected"}
              </p>
              <p className={cn("text-sm max-w-xs", theme === "arcade90s" ? "text-arc-muted font-mono text-xs" : "text-brand-muted")}>
                {hasActiveFilters ? "Try adjusting your filter criteria." : "You don't have any loads yet. Tap 'Create Load' to add your first shipment."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className={cn(
                  "text-xs uppercase tracking-wider font-medium border-b",
                  theme === "arcade90s" ? "bg-arc-panel text-arc-muted border-arc-border arcade-pixel-font" : "bg-brand-dark-pill text-brand-muted border-brand-border"
                )}>
                  <tr>
                    <th className="px-6 py-4">Load #</th>
                    <th className="px-6 py-4">Broker / Shipper</th>
                    <th className="px-6 py-4">Origin & Destination</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">RC</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/50">
                  {myLoads.map((load) => (
                    <tr 
                      key={load.id}
                      onClick={() => setLocation(`/app/loads/${load.id}`)}
                      className={cn(
                        "group cursor-pointer transition-colors relative",
                        theme === "arcade90s" ? "hover:bg-arc-secondary/10 border-arc-border hover:shadow-[inset_0_0_10px_rgba(34,211,238,0.1)]" : "hover:bg-brand-border/30 border-brand-border/50"
                      )}
                      data-testid={`row-load-${load.id}`}
                    >
                      <td className="px-6 py-4 font-mono font-medium whitespace-nowrap">
                        <span className={cn(theme === "arcade90s" ? "text-arc-secondary group-hover:arcade-flicker" : "text-white")}>
                          {load.loadNumber || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className={cn("font-medium", theme === "arcade90s" ? "text-arc-text" : "text-white")}>{load.carrierName || "—"}</div>
                        <div className={cn("text-xs mt-0.5", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>{load.shipperName || "—"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <div className={cn("w-1.5 h-1.5 rounded-full", theme === "arcade90s" ? "bg-arc-primary" : "bg-emerald-500")} />
                            <span className={theme === "arcade90s" ? "text-arc-text" : "text-brand-text"}>
                              {load.originCity && load.originState ? `${load.originCity}, ${load.originState}` : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={cn("w-1.5 h-1.5 rounded-full", theme === "arcade90s" ? "bg-arc-secondary" : "bg-brand-gold")} />
                            <span className={theme === "arcade90s" ? "text-arc-text" : "text-brand-text"}>
                              {load.destinationCity && load.destinationState ? `${load.destinationCity}, ${load.destinationState}` : "—"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border",
                          theme === "arcade90s"
                            ? load.status === "DELIVERED"
                              ? "bg-arc-primary/20 border-arc-primary text-arc-primary shadow-[0_0_5px_rgba(250,204,21,0.3)] rounded-none arcade-pixel-font"
                              : "bg-arc-bg border-arc-secondary text-arc-secondary shadow-[0_0_5px_rgba(34,211,238,0.3)] rounded-none arcade-pixel-font"
                            : load.status === "DELIVERED"
                              ? "bg-brand-gold/10 border-brand-gold/30 text-brand-gold"
                              : load.status === "IN_TRANSIT"
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-brand-dark-pill border-brand-border text-brand-muted"
                        )}>
                          {load.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {load.hasRateConfirmation ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className={cn(
                              "h-7 px-2",
                              theme === "arcade90s" ? "text-arc-secondary hover:text-arc-primary hover:bg-arc-secondary/10 rounded-none" : "text-brand-gold hover:text-white hover:bg-brand-gold/10"
                            )}
                            onClick={(e) => handleDownloadRC(e, load.id)}
                            title="Download Rate Confirmation"
                            data-testid={`button-download-rc-${load.id}`}
                          >
                            <Paperclip className="w-3 h-3 mr-1" />
                            <span className="text-xs">RC</span>
                          </Button>
                        ) : (
                          <span className={cn("text-xs", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn("h-8 w-8", theme === "arcade90s" ? "text-arc-muted hover:text-arc-secondary hover:bg-arc-secondary/10" : "text-brand-muted hover:text-white hover:bg-brand-border")}
                          onClick={(e) => {
                            e.stopPropagation();
                            const trackUrl = `${window.location.origin}/track/${load.id}`;
                            navigator.clipboard.writeText(trackUrl);
                            toast.success("Tracking link copied");
                          }}
                          title="Copy Tracking Link"
                          data-testid={`button-copy-tracking-${load.id}`}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className={cn(
          "max-w-md",
          theme === "arcade90s" ? "bg-arc-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border"
        )}>
          <DialogHeader>
            <DialogTitle className={cn(theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white")}>
              Upload Rate Confirmation
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className={cn("text-xs font-medium uppercase tracking-wide mb-2 block", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Select File (PDF or Image, max 10MB)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-rc-file"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded p-6 text-center cursor-pointer transition-colors",
                  theme === "arcade90s" 
                    ? "border-arc-border hover:border-arc-secondary bg-arc-bg" 
                    : "border-brand-border hover:border-brand-gold bg-brand-bg"
                )}
              >
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className={cn("w-5 h-5", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")} />
                    <span className={cn("text-sm", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                      {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                ) : (
                  <div>
                    <Upload className={cn("w-8 h-8 mx-auto mb-2", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")} />
                    <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                      Click to select a file
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className={cn("text-xs font-medium uppercase tracking-wide mb-2 block", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Attach to Load (Optional)
              </label>
              <Select value={uploadLoadId} onValueChange={setUploadLoadId}>
                <SelectTrigger 
                  className={cn(
                    theme === "arcade90s" ? "bg-arc-bg border-arc-border text-arc-text rounded-none" : "bg-brand-bg border-brand-border"
                  )}
                  data-testid="select-attach-load"
                >
                  <SelectValue placeholder="Select a load..." />
                </SelectTrigger>
                <SelectContent className={cn(theme === "arcade90s" ? "bg-arc-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
                  <SelectItem value="none">No load / attach later</SelectItem>
                  {loads.map((load) => (
                    <SelectItem key={load.id} value={load.id}>
                      {load.loadNumber} — {load.shipperName} → {load.destinationCity || "Dest"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadModal(false);
                setUploadFile(null);
                setUploadLoadId("");
              }}
              className={cn(theme === "arcade90s" ? "rounded-none border-arc-border" : "")}
              data-testid="button-cancel-upload"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadRateConfirmation}
              disabled={!uploadFile || uploading}
              className={cn(
                theme === "arcade90s" 
                  ? "bg-arc-secondary text-black rounded-none hover:bg-arc-secondary/80" 
                  : "bg-brand-gold text-black hover:bg-brand-gold/80"
              )}
              data-testid="button-confirm-upload"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Rate Confirmation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
