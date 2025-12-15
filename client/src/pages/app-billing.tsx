import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { CreditCard, Package, Loader2, Plus, Minus, CheckCircle, Sparkles, X, Copy, ExternalLink } from "lucide-react";
import { BackToLoadsButton } from "@/components/ui/back-to-loads-button";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface BillingSummary {
  plan: string;
  cycleStartAt: string;
  cycleEndAt: string;
  includedLoads: number;
  loadsUsed: number;
  creditsBalance: number;
}

interface SolanaPaymentIntent {
  intentId: string;
  solanaPayUrl: string;
  reference: string;
  amount: string;
  token: string;
  expiresAt: string;
}

interface SolanaIntentStatus {
  id: string;
  status: "PENDING" | "CONFIRMED" | "EXPIRED";
  planCode: string;
  signature?: string;
  confirmedAt?: string;
  expiresAt: string;
  planInfo?: {
    planCode: string;
    includedLoads: number;
    cycleEndAt: string;
  };
}

interface MerchantInfo {
  merchantWallet: string | null;
  usdcMint: string;
  label: string;
  message: string;
  proPlanPrice: number;
  proPlanLoads: number;
  configured: boolean;
}

export default function AppBilling() {
  const { theme } = useTheme();
  const searchString = useSearch();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [purchasing, setPurchasing] = useState(false);
  
  const [merchantInfo, setMerchantInfo] = useState<MerchantInfo | null>(null);
  const [solanaIntent, setSolanaIntent] = useState<SolanaPaymentIntent | null>(null);
  const [intentStatus, setIntentStatus] = useState<SolanaIntentStatus | null>(null);
  const [showSolanaModal, setShowSolanaModal] = useState(false);
  const [creatingIntent, setCreatingIntent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("success") === "true") {
      toast.success("Payment successful! Your credits have been added.");
    }
  }, [searchString]);

  useEffect(() => {
    fetchSummary();
    fetchMerchantInfo();
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

  const fetchMerchantInfo = async () => {
    try {
      const res = await fetch("/api/billing/solana/merchant");
      if (res.ok) {
        const data = await res.json();
        setMerchantInfo(data);
      }
    } catch (error) {
      console.error("Error fetching merchant info:", error);
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

  const handleUpgradeToPro = async () => {
    setCreatingIntent(true);
    try {
      const res = await fetch("/api/billing/solana/pro-intent", {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        const data: SolanaPaymentIntent = await res.json();
        setSolanaIntent(data);
        setIntentStatus(null);
        setShowSolanaModal(true);
      } else {
        const error = await res.json();
        if (error.code === "SOLANA_NOT_CONFIGURED") {
          toast.error("Solana payments are not configured yet. Please contact support.");
        } else {
          toast.error(error.error || "Failed to create payment intent");
        }
      }
    } catch (error) {
      toast.error("Failed to create payment intent");
    } finally {
      setCreatingIntent(false);
    }
  };

  const pollIntentStatus = useCallback(async () => {
    if (!solanaIntent) return;

    try {
      const res = await fetch(`/api/billing/solana/intents/${solanaIntent.intentId}`, {
        credentials: "include",
      });

      if (res.ok) {
        const status: SolanaIntentStatus = await res.json();
        setIntentStatus(status);

        if (status.status === "CONFIRMED") {
          toast.success("Payment confirmed! You are now on the PRO plan.");
          setShowSolanaModal(false);
          setSolanaIntent(null);
          fetchSummary();
          localStorage.removeItem("pp_loadLimitReached");
        } else if (status.status === "EXPIRED") {
          toast.error("Payment expired. Please try again.");
          setShowSolanaModal(false);
          setSolanaIntent(null);
        }
      }
    } catch (error) {
      console.error("Error polling intent status:", error);
    }
  }, [solanaIntent]);

  useEffect(() => {
    if (!showSolanaModal || !solanaIntent) return;

    const interval = setInterval(pollIntentStatus, 4000);
    pollIntentStatus();

    return () => clearInterval(interval);
  }, [showSolanaModal, solanaIntent, pollIntentStatus]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const cycleEndDate = summary?.cycleEndAt
    ? new Date(summary.cycleEndAt).toLocaleDateString()
    : "—";

  const loadsRemaining = summary
    ? Math.max(0, summary.includedLoads - summary.loadsUsed) + summary.creditsBalance
    : 0;

  const isPro = summary?.plan === "PRO";

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
                    <p className={cn("text-xl font-bold flex items-center gap-2", isPro ? (theme === "arcade90s" ? "text-purple-400" : "text-purple-400") : (theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold"))} data-testid="text-current-plan">
                      {summary?.plan || "FREE"}
                      {isPro && <Sparkles className="w-4 h-4" />}
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

            {!isPro && (
              <Card className={cn(
                "relative overflow-hidden",
                theme === "arcade90s" 
                  ? "arcade-panel border-purple-500/50 rounded-none" 
                  : "bg-gradient-to-br from-purple-900/30 to-brand-card border-purple-500/30"
              )}>
                <div className={cn(
                  "absolute top-0 right-0 px-3 py-1 text-xs font-bold uppercase",
                  theme === "arcade90s" 
                    ? "bg-purple-500 text-black" 
                    : "bg-purple-500 text-white"
                )}>
                  Recommended
                </div>
                <CardHeader>
                  <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-purple-400 arcade-pixel-font" : "text-purple-400")}>
                    <Sparkles className="w-4 h-4" /> Upgrade to PRO
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-4xl font-bold", theme === "arcade90s" ? "text-purple-400" : "text-purple-400")}>
                      $99
                    </span>
                    <span className={cn("text-lg", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                      / month
                    </span>
                  </div>
                  
                  <ul className={cn("space-y-2 text-sm", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-purple-400" />
                      200 loads per cycle (vs 3 on FREE)
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-purple-400" />
                      Priority support
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-purple-400" />
                      Pay with USDC on Solana (mainnet)
                    </li>
                  </ul>

                  <Button
                    onClick={handleUpgradeToPro}
                    disabled={creatingIntent || !merchantInfo?.configured}
                    className={cn(
                      "w-full py-3 font-semibold uppercase tracking-wide transition",
                      theme === "arcade90s"
                        ? "bg-purple-500 text-white rounded-none hover:bg-purple-400 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                        : "bg-purple-500 text-white hover:bg-purple-400"
                    )}
                    data-testid="button-upgrade-pro"
                  >
                    {creatingIntent ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating Payment...
                      </>
                    ) : !merchantInfo?.configured ? (
                      "Coming Soon"
                    ) : (
                      "Pay with USDC (Solana)"
                    )}
                  </Button>
                  
                  {!merchantInfo?.configured && (
                    <p className={cn("text-xs text-center", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                      Solana payments will be available soon
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

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

      <Dialog open={showSolanaModal} onOpenChange={setShowSolanaModal}>
        <DialogContent className={cn(
          "max-w-md",
          theme === "arcade90s" 
            ? "bg-arc-bg border-purple-500/50 rounded-none" 
            : "bg-brand-card border-purple-500/30"
        )}>
          <DialogHeader>
            <DialogTitle className={cn("flex items-center gap-2", theme === "arcade90s" ? "text-purple-400 arcade-pixel-font" : "text-purple-400")}>
              <Sparkles className="w-5 h-5" />
              Pay with Solana
            </DialogTitle>
            <DialogDescription className={cn(theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
              Scan the QR code with your Solana wallet to pay 99 USDC
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {solanaIntent && (
              <>
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  <QRCodeSVG 
                    value={solanaIntent.solanaPayUrl} 
                    size={200}
                    level="H"
                    includeMargin
                  />
                </div>

                <div className={cn("p-3 rounded-lg text-center", theme === "arcade90s" ? "bg-arc-bg/50 border border-arc-border" : "bg-brand-bg/50 border border-brand-border")}>
                  {intentStatus?.status === "PENDING" && (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className={cn("w-4 h-4 animate-spin", theme === "arcade90s" ? "text-purple-400" : "text-purple-400")} />
                      <span className={cn("text-sm", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                        Waiting for payment...
                      </span>
                    </div>
                  )}
                  {intentStatus?.status === "CONFIRMED" && (
                    <div className="flex items-center justify-center gap-2 text-emerald-400">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Payment confirmed!</span>
                    </div>
                  )}
                  {!intentStatus && (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className={cn("w-4 h-4 animate-spin", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")} />
                      <span className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        Initializing...
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className={cn("text-xs uppercase tracking-wider", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                    Or copy payment URL:
                  </p>
                  <div className="flex gap-2">
                    <code className={cn(
                      "flex-1 p-2 text-xs break-all rounded",
                      theme === "arcade90s" ? "bg-arc-bg border border-arc-border text-arc-text" : "bg-brand-bg border border-brand-border text-white"
                    )}>
                      {solanaIntent.solanaPayUrl.slice(0, 60)}...
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(solanaIntent.solanaPayUrl)}
                      className={cn(theme === "arcade90s" ? "border-arc-border rounded-none" : "")}
                      data-testid="button-copy-url"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className={cn("text-xs text-center", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                  Payment expires at {new Date(solanaIntent.expiresAt).toLocaleTimeString()}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
