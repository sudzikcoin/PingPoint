import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Shield, 
  UserX, 
  UserCheck,
  Download,
  Save,
  RefreshCw
} from "lucide-react";

interface UserDetailData {
  user: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    emailVerified: boolean;
    isBlocked: boolean;
    createdAt: string;
  };
  billing: {
    plan: string;
    loadsUsed: number;
    includedLoads: number;
    cycleStartAt: string | null;
    cycleEndAt: string | null;
    creditsBalance: number;
  };
  loads: Array<{
    id: string;
    loadNumber: string;
    createdAt: string;
    status: string;
    rateAmount: string;
    pickupCity: string | null;
    pickupState: string | null;
    deliveryCity: string | null;
    deliveryState: string | null;
  }>;
  totalLoads: number;
}

export default function AppAdminUserDetail() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

  const [authChecking, setAuthChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loadsUsed, setLoadsUsed] = useState("");
  const [includedLoads, setIncludedLoads] = useState("");
  const [creditsBalance, setCreditsBalance] = useState("");

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const res = await fetch("/api/admin/me", { credentials: "include" });
        if (!res.ok) {
          setLocation("/app/admin/login");
          return;
        }
        const data = await res.json();
        if (!data.isAdmin) {
          setLocation("/app/admin/login");
          return;
        }
        setAuthorized(true);
      } catch (err) {
        setLocation("/app/admin/login");
      } finally {
        setAuthChecking(false);
      }
    };
    checkAdmin();
  }, [setLocation]);

  const { data, isLoading, refetch } = useQuery<UserDetailData>({
    queryKey: [`/api/admin/users/${userId}`],
    enabled: authorized && !!userId,
  });

  useEffect(() => {
    if (data) {
      setName(data.user.name || "");
      setPhone(data.user.phone || "");
      setEmail(data.user.email || "");
      setLoadsUsed(String(data.billing.loadsUsed || 0));
      setIncludedLoads(String(data.billing.includedLoads || 3));
      setCreditsBalance(String(data.billing.creditsBalance || 0));
    }
  }, [data]);

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: { name?: string; phone?: string; email?: string }) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update profile");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Profile updated");
      refetch();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateUsageMutation = useMutation({
    mutationFn: async (updates: { loadsUsed?: number; includedLoads?: number }) => {
      const res = await fetch(`/api/admin/users/${userId}/update-usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update usage");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Load limits updated");
      refetch();
    },
    onError: () => {
      toast.error("Failed to update load limits");
    },
  });

  const addCreditsMutation = useMutation({
    mutationFn: async (credits: number) => {
      const res = await fetch(`/api/admin/users/${userId}/add-credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credits }),
      });
      if (!res.ok) throw new Error("Failed to add credits");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Credits updated");
      refetch();
    },
    onError: () => {
      toast.error("Failed to update credits");
    },
  });

  const blockMutation = useMutation({
    mutationFn: async (isBlocked: boolean) => {
      const res = await fetch(`/api/admin/users/${userId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isBlocked }),
      });
      if (!res.ok) throw new Error("Failed to update block status");
      return res.json();
    },
    onSuccess: (_, isBlocked) => {
      toast.success(isBlocked ? "User blocked" : "User unblocked");
      refetch();
    },
    onError: () => {
      toast.error("Failed to update block status");
    },
  });

  const handleExportCsv = async () => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/export`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `broker-${data?.user.email || userId}-loads.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch {
      toast.error("Failed to export CSV");
    }
  };

  const cardClasses = cn(
    theme === "arcade90s" 
      ? "arcade-panel border-arc-border rounded-none" 
      : "bg-brand-card border-brand-border"
  );

  const labelClasses = cn(
    "text-xs font-medium uppercase tracking-wide mb-1 block",
    theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted"
  );

  const inputClasses = cn(
    "w-full px-3 py-2 text-sm border rounded",
    theme === "arcade90s" 
      ? "bg-arc-bg border-arc-border text-arc-text rounded-none" 
      : "bg-brand-bg border-brand-border text-white"
  );

  if (authChecking || isLoading) {
    return (
      <AppLayout>
        <div className={cn(
          "flex items-center justify-center min-h-[50vh]",
          theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
        )}>
          Loading...
        </div>
      </AppLayout>
    );
  }

  if (!authorized || !data) {
    return null;
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/app/admin")}
              className={cn(
                theme === "arcade90s"
                  ? "text-arc-muted hover:text-arc-text"
                  : "text-brand-muted hover:text-white"
              )}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Shield className={cn("w-6 h-6", theme === "arcade90s" ? "text-arc-primary" : "text-brand-gold")} />
            <h1 className={cn("text-xl font-bold", theme === "arcade90s" ? "arcade-title arcade-pixel-font" : "text-white")}>
              User Details
            </h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className={cn(theme === "arcade90s" ? "text-arc-secondary" : "text-brand-muted")}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <Card className={cardClasses}>
          <CardHeader className="pb-2">
            <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center justify-between", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
              <div className="flex items-center gap-3">
                <span>{data.user.email}</span>
                <span className={cn(
                  "px-2 py-0.5 rounded text-xs font-medium",
                  data.billing.plan === "PRO" 
                    ? theme === "arcade90s" ? "bg-arc-primary/20 text-arc-primary" : "bg-brand-gold/20 text-brand-gold"
                    : theme === "arcade90s" ? "bg-arc-muted/20 text-arc-muted" : "bg-brand-muted/20 text-brand-muted"
                )}>
                  {data.billing.plan}
                </span>
                {data.user.isBlocked && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">
                    BLOCKED
                  </span>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
              Loads used: {data.billing.loadsUsed} / {data.billing.includedLoads} · Extra credits: {data.billing.creditsBalance}
            </p>
            <p className={cn("text-xs", theme === "arcade90s" ? "text-arc-muted/70" : "text-brand-muted/70")}>
              Created: {new Date(data.user.createdAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className={labelClasses}>Name</label>
                <Input
                  className={inputClasses}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-name"
                />
              </div>
              <div>
                <label className={labelClasses}>Phone</label>
                <Input
                  className={inputClasses}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  data-testid="input-phone"
                />
              </div>
              <div>
                <label className={labelClasses}>Email</label>
                <Input
                  className={inputClasses}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-email"
                />
                <p className={cn("text-xs mt-1", theme === "arcade90s" ? "text-arc-muted/70" : "text-brand-muted/70")}>
                  Warning: Changing email may affect login
                </p>
              </div>
              <Button
                onClick={() => updateProfileMutation.mutate({ name, phone, email })}
                disabled={updateProfileMutation.isPending}
                className={cn(
                  "w-full",
                  theme === "arcade90s"
                    ? "bg-arc-secondary text-black hover:bg-arc-secondary/80 rounded-none"
                    : "bg-brand-gold text-black hover:bg-brand-gold/80"
                )}
                data-testid="button-save-profile"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Profile
              </Button>
            </CardContent>
          </Card>

          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                Account Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={() => blockMutation.mutate(!data.user.isBlocked)}
                disabled={blockMutation.isPending}
                variant="outline"
                className={cn(
                  "w-full",
                  data.user.isBlocked
                    ? theme === "arcade90s"
                      ? "border-green-500 text-green-400 hover:bg-green-500/10 rounded-none"
                      : "border-green-500 text-green-400 hover:bg-green-500/10"
                    : theme === "arcade90s"
                      ? "border-red-500 text-red-400 hover:bg-red-500/10 rounded-none"
                      : "border-red-500 text-red-400 hover:bg-red-500/10"
                )}
                data-testid="button-block-toggle"
              >
                {data.user.isBlocked ? (
                  <>
                    <UserCheck className="w-4 h-4 mr-2" />
                    Unblock User
                  </>
                ) : (
                  <>
                    <UserX className="w-4 h-4 mr-2" />
                    Block User
                  </>
                )}
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClasses}>Loads Used</label>
                  <Input
                    type="number"
                    className={inputClasses}
                    value={loadsUsed}
                    onChange={(e) => setLoadsUsed(e.target.value)}
                    data-testid="input-loads-used"
                  />
                </div>
                <div>
                  <label className={labelClasses}>Included Loads</label>
                  <Input
                    type="number"
                    className={inputClasses}
                    value={includedLoads}
                    onChange={(e) => setIncludedLoads(e.target.value)}
                    data-testid="input-included-loads"
                  />
                </div>
              </div>
              <Button
                onClick={() => updateUsageMutation.mutate({
                  loadsUsed: parseInt(loadsUsed) || 0,
                  includedLoads: parseInt(includedLoads) || 3,
                })}
                disabled={updateUsageMutation.isPending}
                variant="outline"
                className={cn(
                  "w-full",
                  theme === "arcade90s"
                    ? "border-arc-border text-arc-text hover:bg-arc-bg rounded-none"
                    : "border-brand-border text-white hover:bg-brand-bg"
                )}
                data-testid="button-save-load-limits"
              >
                Save Load Limits
              </Button>

              <div>
                <label className={labelClasses}>Extra Credits</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    className={inputClasses}
                    value={creditsBalance}
                    onChange={(e) => setCreditsBalance(e.target.value)}
                    data-testid="input-credits"
                  />
                  <Button
                    onClick={() => {
                      const diff = parseInt(creditsBalance) - (data.billing.creditsBalance || 0);
                      if (diff > 0) {
                        addCreditsMutation.mutate(diff);
                      } else {
                        toast.error("Can only add credits (positive amount)");
                      }
                    }}
                    disabled={addCreditsMutation.isPending}
                    variant="outline"
                    className={cn(
                      theme === "arcade90s"
                        ? "border-arc-secondary text-arc-secondary hover:bg-arc-secondary/10 rounded-none"
                        : "border-brand-gold text-brand-gold hover:bg-brand-gold/10"
                    )}
                    data-testid="button-add-credits"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className={cardClasses}>
          <CardHeader>
            <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center justify-between", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
              <span>Loads ({data.totalLoads})</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className={cn(
                  theme === "arcade90s"
                    ? "border-arc-secondary text-arc-secondary hover:bg-arc-secondary/10 rounded-none"
                    : "border-brand-gold text-brand-gold hover:bg-brand-gold/10"
                )}
                data-testid="button-export-csv"
              >
                <Download className="w-4 h-4 mr-1" />
                Export CSV
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn("border-b", theme === "arcade90s" ? "border-arc-border text-arc-muted" : "border-brand-border text-brand-muted")}>
                    <th className="text-left py-2 px-2">Load #</th>
                    <th className="text-left py-2 px-2">Created</th>
                    <th className="text-left py-2 px-2">Route</th>
                    <th className="text-left py-2 px-2">Rate</th>
                    <th className="text-left py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.loads.map((load) => (
                    <tr 
                      key={load.id} 
                      className={cn("border-b", theme === "arcade90s" ? "border-arc-border/50" : "border-brand-border/50")}
                    >
                      <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                        {load.loadNumber}
                      </td>
                      <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        {new Date(load.createdAt).toLocaleDateString()}
                      </td>
                      <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                        {load.pickupCity && load.pickupState ? `${load.pickupCity}, ${load.pickupState}` : "-"} 
                        {" → "}
                        {load.deliveryCity && load.deliveryState ? `${load.deliveryCity}, ${load.deliveryState}` : "-"}
                      </td>
                      <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-secondary" : "text-emerald-400")}>
                        ${load.rateAmount}
                      </td>
                      <td className="py-2 px-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          load.status === "DELIVERED"
                            ? "bg-green-500/20 text-green-400"
                            : load.status === "IN_TRANSIT"
                              ? "bg-blue-500/20 text-blue-400"
                              : theme === "arcade90s" ? "bg-arc-muted/20 text-arc-muted" : "bg-brand-muted/20 text-brand-muted"
                        )}>
                          {load.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.loads.length === 0 && (
                    <tr>
                      <td colSpan={5} className={cn("py-8 text-center", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        No loads
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
