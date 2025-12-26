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
  const [upgradingWithCard, setUpgradingWithCard] = useState(false);
  
  // Promo code state
  const [promoCode, setPromoCode] = useState("");
  const [promoValidating, setPromoValidating] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{
    valid: boolean;
    code: string;
    discountType: string;
    discountValue: number;
    rewardLoads: number;
    message: string;
  } | null>(null);

  // Referral state
  const [referralData, setReferralData] = useState<{
    referralCode: string;
    referralLink: string;
    totalReferrals: number;
    activeReferrals: number;
    totalRewardsEarned: number;
  } | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("success") === "true") {
      toast.success("Payment successful! Your credits have been added.");
    }
  }, [searchString]);

  useEffect(() => {
    fetchSummary();
    fetchMerchantInfo();
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      const res = await fetch("/api/broker/referral", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setReferralData(data);
      }
    } catch (error) {
      console.error("Error fetching referral data:", error);
    }
  };

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

  const handleUpgradeWithCard = async () => {
    setUpgradingWithCard(true);
    try {
      const res = await fetch("/api/billing/stripe/checkout-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          promoCode: appliedPromo?.code || undefined 
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        const error = await res.json();
        if (error.code === "STRIPE_NOT_CONFIGURED") {
          toast.error("Card payments are not configured yet. Please contact support.");
        } else {
          toast.error(error.error || "Failed to start checkout");
        }
      }
    } catch (error) {
      toast.error("Failed to start checkout");
    } finally {
      setUpgradingWithCard(false);
    }
  };

  const handleUpgradeWithSolana = async () => {
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

  const handleValidatePromo = async () => {
    if (!promoCode.trim()) return;
    
    setPromoValidating(true);
    try {
      const res = await fetch("/api/billing/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      
      const data = await res.json();
      if (data.valid) {
        setAppliedPromo(data);
        toast.success(data.message);
      } else {
        toast.error(data.message || "Invalid promo code");
        setAppliedPromo(null);
      }
    } catch (error) {
      toast.error("Failed to validate promo code");
      setAppliedPromo(null);
    } finally {
      setPromoValidating(false);
    }
  };

  const handleClearPromo = () => {
    setPromoCode("");
    setAppliedPromo(null);
  };

  const handleCopyReferralLink = async () => {
    if (!referralData) return;
    try {
      await navigator.clipboard.writeText(referralData.referralLink);
      setReferralCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setReferralCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
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

                  {/* Promo Code Input */}
                  <div className={cn("p-3 rounded border", theme === "arcade90s" ? "border-arc-border bg-arc-bg/50" : "border-brand-border/50 bg-brand-bg/30")}>
                    <div className={cn("text-xs uppercase tracking-wide mb-2", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>
                      Have a promo code?
                    </div>
                    {appliedPromo ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={cn("font-mono font-bold", theme === "arcade90s" ? "text-arc-secondary" : "text-green-400")}>
                            {appliedPromo.code}
                          </span>
                          <p className={cn("text-xs mt-1", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                            {appliedPromo.message}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClearPromo}
                          className={cn(theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}
                          data-testid="button-clear-promo"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                          placeholder="Enter code"
                          className={cn(
                            "flex-1 px-3 py-2 text-sm border rounded",
                            theme === "arcade90s" 
                              ? "bg-arc-bg border-arc-border text-arc-text rounded-none placeholder:text-arc-muted/50" 
                              : "bg-brand-bg border-brand-border text-white placeholder:text-brand-muted/50"
                          )}
                          data-testid="input-promo-code"
                        />
                        <Button
                          onClick={handleValidatePromo}
                          disabled={!promoCode.trim() || promoValidating}
                          className={cn(
                            "px-4",
                            theme === "arcade90s" 
                              ? "bg-arc-secondary text-black rounded-none" 
                              : "bg-brand-gold text-black"
                          )}
                          data-testid="button-apply-promo"
                        >
                          {promoValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Button
                      onClick={handleUpgradeWithCard}
                      disabled={upgradingWithCard}
                      className={cn(
                        "w-full py-3 font-semibold uppercase tracking-wide transition",
                        theme === "arcade90s"
                          ? "bg-purple-500 text-white rounded-none hover:bg-purple-400 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                          : "bg-purple-500 text-white hover:bg-purple-400"
                      )}
                      data-testid="button-upgrade-pro-card"
                    >
                      {upgradingWithCard ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Pay with Card ($99/mo)
                        </>
                      )}
                    </Button>

                    <div className={cn("flex items-center gap-2", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                      <div className="flex-1 h-px bg-current opacity-30" />
                      <span className="text-xs uppercase">or</span>
                      <div className="flex-1 h-px bg-current opacity-30" />
                    </div>

                    <Button
                      onClick={handleUpgradeWithSolana}
                      disabled={creatingIntent || !merchantInfo?.configured}
                      variant="outline"
                      className={cn(
                        "w-full py-3 font-semibold uppercase tracking-wide transition",
                        theme === "arcade90s"
                          ? "border-purple-500/50 text-purple-400 rounded-none hover:bg-purple-500/10"
                          : "border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                      )}
                      data-testid="button-upgrade-pro-solana"
                    >
                      {creatingIntent ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating Payment...
                        </>
                      ) : !merchantInfo?.configured ? (
                        "USDC (Coming Soon)"
                      ) : (
                        "Pay with USDC (Solana)"
                      )}
                    </Button>
                  </div>
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

            {/* Referral Program Section */}
            {referralData && (
              <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
                <CardHeader>
                  <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                    <Sparkles className="w-4 h-4" /> Refer & Earn
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                    Earn <span className={cn("font-bold", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")}>20 free loads</span> for each friend who subscribes to PRO!
                    They get <span className={cn("font-bold", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")}>10 free loads</span> too.
                  </p>

                  <div className={cn("p-3 rounded border", theme === "arcade90s" ? "border-arc-border bg-arc-bg/50" : "border-brand-border/50 bg-brand-bg/30")}>
                    <div className={cn("text-xs uppercase tracking-wide mb-2", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>
                      Your Referral Code
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("font-mono text-lg font-bold tracking-widest", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")} data-testid="text-referral-code">
                        {referralData.referralCode}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyReferralLink}
                        className={cn(theme === "arcade90s" ? "border-arc-border rounded-none" : "")}
                        data-testid="button-copy-referral-link"
                      >
                        {referralCopied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                        <span className="ml-2">{referralCopied ? "Copied!" : "Copy Link"}</span>
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className={cn("p-3 rounded text-center", theme === "arcade90s" ? "bg-arc-bg/50 border border-arc-border" : "bg-brand-bg/50 border border-brand-border/50")}>
                      <div className={cn("text-2xl font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")} data-testid="text-total-referrals">
                        {referralData.totalReferrals}
                      </div>
                      <div className={cn("text-xs uppercase", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        Referrals
                      </div>
                    </div>
                    <div className={cn("p-3 rounded text-center", theme === "arcade90s" ? "bg-arc-bg/50 border border-arc-border" : "bg-brand-bg/50 border border-brand-border/50")}>
                      <div className={cn("text-2xl font-bold", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")} data-testid="text-active-referrals">
                        {referralData.activeReferrals}
                      </div>
                      <div className={cn("text-xs uppercase", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        Active
                      </div>
                    </div>
                    <div className={cn("p-3 rounded text-center", theme === "arcade90s" ? "bg-arc-bg/50 border border-arc-border" : "bg-brand-bg/50 border border-brand-border/50")}>
                      <div className={cn("text-2xl font-bold text-green-400")} data-testid="text-rewards-earned">
                        {referralData.totalRewardsEarned}
                      </div>
                      <div className={cn("text-xs uppercase", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                        Loads Earned
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
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
