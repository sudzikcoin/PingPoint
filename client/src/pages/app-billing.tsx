import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { Wallet, Package, AlertCircle } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";

export default function AppBilling() {
  const { theme } = useTheme();
  const {
    address,
    chainId,
    networkName,
    isConnecting,
    error,
    connectMetaMask,
    connectCoinbase,
  } = useWallet();

  const isSupportedChain = chainId != null && (chainId === 1 || chainId === 8453);

  const walletStatusMessage = (() => {
    if (!address) return "No wallet connected.";
    if (!isSupportedChain) {
      return "Connected wallet must be on Base or Ethereum to pay in USDC. Please switch networks in your wallet.";
    }
    return `Connected: ${address.slice(0, 6)}…${address.slice(-4)} on ${networkName}`;
  })();

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

        {/* Payment Methods - Single Card */}
        <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
          <CardHeader>
            <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
              <Wallet className="w-4 h-4" /> Payment Methods
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Pay securely with card (Stripe – coming soon) or connect a crypto wallet to pay in USDC.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={connectMetaMask}
                  disabled={isConnecting}
                  className={cn(
                    "px-4 py-2 font-semibold uppercase tracking-wide transition",
                    theme === "arcade90s" 
                      ? "bg-arc-primary text-black rounded-none hover:bg-arc-primary/80" 
                      : "bg-cyan-400 text-slate-900 hover:bg-cyan-300 rounded-full"
                  )}
                  data-testid="button-connect-metamask"
                >
                  {isConnecting ? "Connecting…" : "Connect MetaMask"}
                </Button>

                <Button
                  type="button"
                  onClick={connectCoinbase}
                  disabled={isConnecting}
                  className={cn(
                    "px-4 py-2 font-semibold uppercase tracking-wide transition",
                    theme === "arcade90s" 
                      ? "bg-arc-secondary text-black rounded-none hover:bg-arc-secondary/80" 
                      : "bg-yellow-300 text-slate-900 hover:bg-yellow-200 rounded-full"
                  )}
                  data-testid="button-connect-coinbase"
                >
                  {isConnecting ? "Connecting…" : "Connect Coinbase Wallet"}
                </Button>
              </div>

              <div className={cn("text-xs space-y-2", theme === "arcade90s" ? "text-arc-muted font-mono" : "text-slate-400")}>
                <p data-testid="text-wallet-status">{walletStatusMessage}</p>
                <p>
                  We accept <span className={cn("font-semibold", theme === "arcade90s" ? "text-arc-primary" : "text-cyan-300")}>USDC only</span> on{" "}
                  <span className="font-semibold">Base</span>, <span className="font-semibold">Ethereum</span>, and <span className="font-semibold">Solana</span>.
                  Please ensure you choose the correct network in your wallet.
                </p>
              </div>

              {address && !isSupportedChain && (
                <div className={cn("flex items-start gap-2 p-3 rounded border", 
                  theme === "arcade90s" ? "bg-red-900/20 border-red-500/50 text-red-400" : "bg-red-900/20 border-red-500/50 text-red-400"
                )}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="text-xs">
                    Your wallet is connected to an unsupported network (Chain {chainId}). 
                    Please switch to Base or Ethereum in your wallet to proceed.
                  </p>
                </div>
              )}

              {error && (
                <div className={cn("mt-2 text-xs", theme === "arcade90s" ? "text-red-400 font-mono" : "text-red-400")} data-testid="text-wallet-error">
                  {error}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
