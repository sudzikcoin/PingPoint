import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { 
  Users, 
  CreditCard, 
  FileText, 
  Gift, 
  Shield, 
  Plus,
  RefreshCw
} from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  emailVerified: boolean;
  createdAt: string;
  plan: string;
  loadsUsed: number;
  includedLoads: number;
  cycleStartAt: string | null;
  cycleEndAt: string | null;
  creditsBalance: number;
  totalLoads: number;
}

interface AuditLog {
  id: string;
  actorEmail: string;
  targetBrokerId: string | null;
  action: string;
  metadata: string | null;
  createdAt: string;
}

interface Promotion {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  createdAt: string;
}

interface Subscription {
  brokerId: string;
  brokerEmail: string;
  brokerName: string;
  plan: string;
  includedLoads: number;
  loadsUsed: number;
  cycleStartAt: string;
  cycleEndAt: string;
}

type Tab = "users" | "subscriptions" | "logs" | "promotions";

export default function AppAdmin() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [creditsToAdd, setCreditsToAdd] = useState("1");
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoDescription, setPromoDescription] = useState("");
  const [promoType, setPromoType] = useState("FIXED_LOAD_CREDITS");
  const [promoValue, setPromoValue] = useState("1");

  const { data: usersData, isLoading: usersLoading } = useQuery<{ items: AdminUser[]; total: number }>({
    queryKey: ["/api/admin/users"],
    enabled: activeTab === "users",
  });

  const { data: subscriptionsData } = useQuery<{ subscriptions: Subscription[] }>({
    queryKey: ["/api/admin/subscriptions"],
    enabled: activeTab === "subscriptions",
  });

  const { data: logsData } = useQuery<{ items: AuditLog[] }>({
    queryKey: ["/api/admin/logs"],
    enabled: activeTab === "logs",
  });

  const { data: promotionsData } = useQuery<{ promotions: Promotion[] }>({
    queryKey: ["/api/admin/promotions"],
    enabled: activeTab === "promotions",
  });

  const addCreditsMutation = useMutation({
    mutationFn: async ({ userId, credits }: { userId: string; credits: number }) => {
      const res = await fetch(`/api/admin/users/${userId}/add-credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits }),
      });
      if (!res.ok) throw new Error("Failed to add credits");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Credits added successfully");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUser(null);
    },
    onError: () => {
      toast.error("Failed to add credits");
    },
  });

  const createPromoMutation = useMutation({
    mutationFn: async (promo: { code: string; description: string; discountType: string; discountValue: number }) => {
      const res = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promo),
      });
      if (!res.ok) throw new Error("Failed to create promotion");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Promotion created");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] });
      setShowPromoForm(false);
      setPromoCode("");
      setPromoDescription("");
      setPromoValue("1");
    },
    onError: () => {
      toast.error("Failed to create promotion");
    },
  });

  const cardClasses = cn(
    theme === "arcade90s" 
      ? "arcade-panel border-arc-border rounded-none" 
      : "bg-brand-card border-brand-border"
  );

  const tabClasses = (tab: Tab) => cn(
    "px-4 py-2 text-sm font-medium transition-colors",
    activeTab === tab
      ? theme === "arcade90s"
        ? "bg-arc-primary text-black"
        : "bg-brand-gold text-black"
      : theme === "arcade90s"
        ? "text-arc-muted hover:text-arc-text hover:bg-arc-bg/50"
        : "text-brand-muted hover:text-white hover:bg-brand-bg/50"
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

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Shield className={cn("w-6 h-6", theme === "arcade90s" ? "text-arc-primary" : "text-brand-gold")} />
          <h1 className={cn("text-2xl font-bold", theme === "arcade90s" ? "arcade-title arcade-pixel-font" : "text-white")}>
            Admin Panel
          </h1>
        </div>

        <div className={cn("flex gap-1 p-1 rounded", theme === "arcade90s" ? "bg-arc-bg border border-arc-border" : "bg-brand-bg border border-brand-border")}>
          <button onClick={() => setActiveTab("users")} className={tabClasses("users")} data-testid="tab-users">
            <Users className="w-4 h-4 inline mr-2" />
            Users
          </button>
          <button onClick={() => setActiveTab("subscriptions")} className={tabClasses("subscriptions")} data-testid="tab-subscriptions">
            <CreditCard className="w-4 h-4 inline mr-2" />
            Subscriptions
          </button>
          <button onClick={() => setActiveTab("logs")} className={tabClasses("logs")} data-testid="tab-logs">
            <FileText className="w-4 h-4 inline mr-2" />
            Audit Logs
          </button>
          <button onClick={() => setActiveTab("promotions")} className={tabClasses("promotions")} data-testid="tab-promotions">
            <Gift className="w-4 h-4 inline mr-2" />
            Promotions
          </button>
        </div>

        {activeTab === "users" && (
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center justify-between", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                <span>All Users ({usersData?.total || 0})</span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] })}
                  className={cn(theme === "arcade90s" ? "text-arc-secondary" : "text-brand-muted")}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className={cn("text-center py-8", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Loading...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={cn("border-b", theme === "arcade90s" ? "border-arc-border text-arc-muted" : "border-brand-border text-brand-muted")}>
                        <th className="text-left py-2 px-2">Email</th>
                        <th className="text-left py-2 px-2">Name</th>
                        <th className="text-left py-2 px-2">Plan</th>
                        <th className="text-left py-2 px-2">Loads Used</th>
                        <th className="text-left py-2 px-2">Credits</th>
                        <th className="text-left py-2 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersData?.items.map((user) => (
                        <tr 
                          key={user.id} 
                          className={cn("border-b", theme === "arcade90s" ? "border-arc-border/50" : "border-brand-border/50")}
                        >
                          <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                            {user.email}
                            {user.emailVerified && <span className="ml-1 text-green-500">✓</span>}
                          </td>
                          <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                            {user.name}
                          </td>
                          <td className="py-2 px-2">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium",
                              user.plan === "PRO" 
                                ? theme === "arcade90s" ? "bg-arc-primary/20 text-arc-primary" : "bg-brand-gold/20 text-brand-gold"
                                : theme === "arcade90s" ? "bg-arc-muted/20 text-arc-muted" : "bg-brand-muted/20 text-brand-muted"
                            )}>
                              {user.plan}
                            </span>
                          </td>
                          <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                            {user.loadsUsed} / {user.includedLoads}
                          </td>
                          <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-secondary" : "text-emerald-400")}>
                            {user.creditsBalance}
                          </td>
                          <td className="py-2 px-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedUser(user)}
                              className={cn(
                                "text-xs",
                                theme === "arcade90s" 
                                  ? "border-arc-secondary text-arc-secondary hover:bg-arc-secondary/10 rounded-none" 
                                  : "border-brand-gold text-brand-gold hover:bg-brand-gold/10"
                              )}
                              data-testid={`button-add-credits-${user.id}`}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add Credits
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "subscriptions" && (
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                Active PRO Subscriptions ({subscriptionsData?.subscriptions.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={cn("border-b", theme === "arcade90s" ? "border-arc-border text-arc-muted" : "border-brand-border text-brand-muted")}>
                      <th className="text-left py-2 px-2">Email</th>
                      <th className="text-left py-2 px-2">Name</th>
                      <th className="text-left py-2 px-2">Loads Used</th>
                      <th className="text-left py-2 px-2">Cycle End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptionsData?.subscriptions.map((sub) => (
                      <tr 
                        key={sub.brokerId} 
                        className={cn("border-b", theme === "arcade90s" ? "border-arc-border/50" : "border-brand-border/50")}
                      >
                        <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                          {sub.brokerEmail}
                        </td>
                        <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                          {sub.brokerName}
                        </td>
                        <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                          {sub.loadsUsed} / {sub.includedLoads}
                        </td>
                        <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                          {sub.cycleEndAt ? new Date(sub.cycleEndAt).toLocaleDateString() : "-"}
                        </td>
                      </tr>
                    ))}
                    {!subscriptionsData?.subscriptions.length && (
                      <tr>
                        <td colSpan={4} className={cn("py-8 text-center", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                          No active subscriptions
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "logs" && (
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                Audit Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={cn("border-b", theme === "arcade90s" ? "border-arc-border text-arc-muted" : "border-brand-border text-brand-muted")}>
                      <th className="text-left py-2 px-2">Time</th>
                      <th className="text-left py-2 px-2">Admin</th>
                      <th className="text-left py-2 px-2">Action</th>
                      <th className="text-left py-2 px-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsData?.items.map((log) => (
                      <tr 
                        key={log.id} 
                        className={cn("border-b", theme === "arcade90s" ? "border-arc-border/50" : "border-brand-border/50")}
                      >
                        <td className={cn("py-2 px-2 text-xs", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                          {log.actorEmail}
                        </td>
                        <td className="py-2 px-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium",
                            theme === "arcade90s" ? "bg-arc-secondary/20 text-arc-secondary" : "bg-blue-500/20 text-blue-400"
                          )}>
                            {log.action}
                          </span>
                        </td>
                        <td className={cn("py-2 px-2 text-xs font-mono", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                          {log.metadata ? log.metadata.substring(0, 50) + (log.metadata.length > 50 ? "..." : "") : "-"}
                        </td>
                      </tr>
                    ))}
                    {!logsData?.items.length && (
                      <tr>
                        <td colSpan={4} className={cn("py-8 text-center", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                          No audit logs yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "promotions" && (
          <Card className={cardClasses}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center justify-between", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                <span>Promotions</span>
                <Button
                  size="sm"
                  onClick={() => setShowPromoForm(!showPromoForm)}
                  className={cn(
                    theme === "arcade90s" 
                      ? "bg-arc-secondary text-black rounded-none" 
                      : "bg-brand-gold text-black"
                  )}
                  data-testid="button-new-promo"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Promo
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {showPromoForm && (
                <div className={cn("p-4 rounded border space-y-3", theme === "arcade90s" ? "border-arc-border bg-arc-bg/50" : "border-brand-border bg-brand-bg/30")}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClasses}>Code</label>
                      <Input
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="e.g. SUMMER2024"
                        className={inputClasses}
                        data-testid="input-promo-code"
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>Value (Credits)</label>
                      <Input
                        type="number"
                        value={promoValue}
                        onChange={(e) => setPromoValue(e.target.value)}
                        className={inputClasses}
                        data-testid="input-promo-value"
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClasses}>Description</label>
                    <Input
                      value={promoDescription}
                      onChange={(e) => setPromoDescription(e.target.value)}
                      placeholder="Optional description"
                      className={inputClasses}
                      data-testid="input-promo-description"
                    />
                  </div>
                  <Button
                    onClick={() => createPromoMutation.mutate({
                      code: promoCode,
                      description: promoDescription,
                      discountType: promoType,
                      discountValue: parseInt(promoValue) || 1,
                    })}
                    disabled={!promoCode || createPromoMutation.isPending}
                    className={cn(
                      theme === "arcade90s" 
                        ? "bg-arc-primary text-black rounded-none" 
                        : "bg-brand-gold text-black"
                    )}
                    data-testid="button-create-promo"
                  >
                    {createPromoMutation.isPending ? "Creating..." : "Create Promotion"}
                  </Button>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={cn("border-b", theme === "arcade90s" ? "border-arc-border text-arc-muted" : "border-brand-border text-brand-muted")}>
                      <th className="text-left py-2 px-2">Code</th>
                      <th className="text-left py-2 px-2">Description</th>
                      <th className="text-left py-2 px-2">Value</th>
                      <th className="text-left py-2 px-2">Redemptions</th>
                      <th className="text-left py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promotionsData?.promotions.map((promo) => (
                      <tr 
                        key={promo.id} 
                        className={cn("border-b", theme === "arcade90s" ? "border-arc-border/50" : "border-brand-border/50")}
                      >
                        <td className={cn("py-2 px-2 font-mono", theme === "arcade90s" ? "text-arc-primary" : "text-brand-gold")}>
                          {promo.code}
                        </td>
                        <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                          {promo.description || "-"}
                        </td>
                        <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                          {promo.discountValue} credits
                        </td>
                        <td className={cn("py-2 px-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                          {promo.redemptionCount}{promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ""}
                        </td>
                        <td className="py-2 px-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium",
                            promo.active 
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400"
                          )}>
                            {promo.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!promotionsData?.promotions.length && (
                      <tr>
                        <td colSpan={5} className={cn("py-8 text-center", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                          No promotions yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedUser(null)}>
            <div 
              className={cn("p-6 rounded-lg max-w-md w-full mx-4", theme === "arcade90s" ? "bg-arc-bg border border-arc-border" : "bg-brand-card border border-brand-border")}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className={cn("text-lg font-bold mb-4", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white")}>
                Add Credits to {selectedUser.email}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className={labelClasses}>Current Balance</label>
                  <p className={cn("text-lg font-bold", theme === "arcade90s" ? "text-arc-secondary" : "text-emerald-400")}>
                    {selectedUser.creditsBalance} credits
                  </p>
                </div>
                <div>
                  <label className={labelClasses}>Credits to Add</label>
                  <Input
                    type="number"
                    value={creditsToAdd}
                    onChange={(e) => setCreditsToAdd(e.target.value)}
                    min="1"
                    className={inputClasses}
                    data-testid="input-credits-amount"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setSelectedUser(null)}
                    variant="outline"
                    className={cn(
                      "flex-1",
                      theme === "arcade90s" 
                        ? "border-arc-border text-arc-muted rounded-none" 
                        : "border-brand-border text-brand-muted"
                    )}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => addCreditsMutation.mutate({ 
                      userId: selectedUser.id, 
                      credits: parseInt(creditsToAdd) || 1 
                    })}
                    disabled={addCreditsMutation.isPending}
                    className={cn(
                      "flex-1",
                      theme === "arcade90s" 
                        ? "bg-arc-primary text-black rounded-none" 
                        : "bg-brand-gold text-black"
                    )}
                    data-testid="button-confirm-add-credits"
                  >
                    {addCreditsMutation.isPending ? "Adding..." : "Add Credits"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
