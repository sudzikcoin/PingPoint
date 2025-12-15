import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { CreditCard, Package, Loader2, Plus, Minus, CheckCircle } from "lucide-react";
import { BackToLoadsButton } from "@/components/ui/back-to-loads-button";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";

interface BillingSummary {
  plan: string;
  cycleStartAt: string;
  cycleEndAt: string;
  includedLoads: number;
  loadsUsed: number;
  creditsBalance: number;
}

export default function AppBilling() {
  const { theme } = useTheme();
  const searchString = useSearch();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("success") === "true") {
      toast.success("Payment successful! Your credits have been added.");
    }
  }, [searchString]);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/billing/summary", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (error) {
      console.error("Error fetching billing summary:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyCredits = async () => {
    setPurchasing(true);
    try {
      const res = await fetch("/api/billing/stripe/checkout-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ quantity }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to start checkout");
      }
    } catch (error) {
      toast.error("Failed to start checkout");
    } finally {
      setPurchasing(false);
    }
  };

  const cycleEndDate = summary?.cycleEndAt
    ? new Date(summary.cycleEndAt).toLocaleDateString()
    : "—";

  const loadsRemaining = summary
    ? Math.max(0, summary.includedLoads - summary.loadsUsed) + summary.creditsBalance
    : 0;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <BackToLoadsButton />
          <div>
            <h1 className={cn("text-2xl font-bold", theme === "arcade90s" ? "arcade-title arcade-pixel-font" : "text-white")}>
              Billing
            </h1>
            <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted")}>
              Manage your load credits and subscription
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className={cn("w-8 h-8 animate-spin", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")} />
          </div>
        ) : (
          <>
            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader>
                <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                  <Package className="w-4 h-4" /> Current Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Plan</p>
                    <p className={cn("text-xl font-bold", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")} data-testid="text-current-plan">
                      {summary?.plan || "FREE"}
                    </p>
                  </div>
                  <div>
                    <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Loads Used</p>
                    <p className={cn("text-xl font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")} data-testid="text-loads-used">
                      {summary?.loadsUsed || 0} / {summary?.includedLoads || 3}
                    </p>
                  </div>
                  <div>
                    <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Extra Credits</p>
                    <p className={cn("text-xl font-bold", theme === "arcade90s" ? "text-arc-primary" : "text-emerald-400")} data-testid="text-credits-balance">
                      {summary?.creditsBalance || 0}
                    </p>
                  </div>
                  <div>
                    <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Cycle Ends</p>
                    <p className={cn("text-xl font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")} data-testid="text-cycle-end">
                      {cycleEndDate}
                    </p>
                  </div>
                </div>

                <div className={cn("mt-6 p-4 rounded-lg", theme === "arcade90s" ? "bg-arc-primary/10 border border-arc-primary/30" : "bg-emerald-500/10 border border-emerald-500/30")}>
                  <div className="flex items-center gap-2">
                    <CheckCircle className={cn("w-5 h-5", theme === "arcade90s" ? "text-arc-primary" : "text-emerald-400")} />
                    <span className={cn("font-medium", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                      {loadsRemaining} loads remaining this cycle
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader>
                <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                  <CreditCard className="w-4 h-4" /> Buy Extra Load Credits
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Each credit allows you to create one additional load beyond your monthly limit.
                </p>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={quantity <= 1}
                      className={cn(theme === "arcade90s" ? "border-arc-border rounded-none" : "")}
                      data-testid="button-decrease-quantity"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span className={cn("text-2xl font-bold w-12 text-center", theme === "arcade90s" ? "text-arc-text" : "text-white")} data-testid="text-quantity">
                      {quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantity(Math.min(100, quantity + 1))}
                      disabled={quantity >= 100}
                      className={cn(theme === "arcade90s" ? "border-arc-border rounded-none" : "")}
                      data-testid="button-increase-quantity"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className={cn("text-lg", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                    × $0.99 = <span className={cn("font-bold", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")}>${(quantity * 0.99).toFixed(2)}</span>
                  </div>
                </div>

                <Button
                  onClick={handleBuyCredits}
                  disabled={purchasing}
                  className={cn(
                    "w-full py-3 font-semibold uppercase tracking-wide transition",
                    theme === "arcade90s"
                      ? "bg-arc-secondary text-black rounded-none hover:bg-arc-secondary/80 hover:shadow-[0_0_20px_rgba(255,215,0,0.4)]"
                      : "bg-brand-gold text-black hover:bg-brand-gold/90"
                  )}
                  data-testid="button-buy-credits"
                >
                  {purchasing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Buy ${quantity} Credit${quantity > 1 ? "s" : ""}`
                  )}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
