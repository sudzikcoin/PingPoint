import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { CreditCard, Wallet, Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CryptoWalletModal } from "@/components/billing/CryptoWalletModal";

export default function AppBilling() {
  const { theme } = useTheme();
  const [isWalletModalOpen, setWalletModalOpen] = useState(false);

  const handleCardPayment = () => {
    // TODO: integrate Stripe
    toast.info("Card payments via Stripe are coming soon.");
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className={cn("text-2xl font-bold mb-2", theme === "arcade90s" ? "arcade-title arcade-pixel-font" : "text-white")}>
            Billing
          </h1>
          <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted")}>
            Manage your subscription and payment methods
          </p>
        </div>

        {/* Current Plan */}
        <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
          <CardHeader>
            <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
              <Package className="w-4 h-4" /> Current Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Plan</p>
                <p className={cn("text-xl font-bold", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")}>Free Trial</p>
              </div>
              <div>
                <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Loads This Month</p>
                <p className={cn("text-xl font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")}>0 / 10</p>
              </div>
              <div>
                <p className={cn("text-xs uppercase tracking-wider mb-1", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>Extra Load Price</p>
                <p className={cn("text-xl font-bold", theme === "arcade90s" ? "text-arc-text" : "text-white")}>$0.99</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card Payment */}
          <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                <CreditCard className="w-4 h-4" /> Card Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Pay securely with credit or debit card via Stripe.
              </p>
              <Button
                onClick={handleCardPayment}
                className={cn(
                  "w-full py-3 font-semibold uppercase tracking-wide transition",
                  theme === "arcade90s" 
                    ? "bg-arc-secondary text-black rounded-none hover:bg-arc-secondary/80 hover:shadow-[0_0_20px_rgba(255,215,0,0.4)]" 
                    : "bg-brand-gold text-black hover:bg-brand-gold/90"
                )}
                data-testid="button-pay-with-card"
              >
                Pay with Card
              </Button>
            </CardContent>
          </Card>

          {/* Crypto Payment */}
          <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                <Wallet className="w-4 h-4" /> Crypto Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Connect a crypto wallet to pay in USDC. We accept USDC only on Base, Ethereum, and Solana networks.
              </p>
              <Button
                onClick={() => setWalletModalOpen(true)}
                className={cn(
                  "w-full py-3 font-semibold uppercase tracking-wide transition",
                  theme === "arcade90s" 
                    ? "bg-arc-primary text-black rounded-none hover:bg-arc-primary/80 hover:shadow-[0_0_20px_rgba(0,255,255,0.4)]" 
                    : "bg-cyan-400 text-slate-900 hover:bg-cyan-300"
                )}
                data-testid="button-connect-crypto-wallet"
              >
                Connect Crypto Wallet
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <CryptoWalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setWalletModalOpen(false)} 
      />
    </AppLayout>
  );
}
