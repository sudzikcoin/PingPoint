import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useState } from "react";

interface CryptoWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CryptoWalletModal({ isOpen, onClose }: CryptoWalletModalProps) {
  const { theme } = useTheme();
  const [notice, setNotice] = useState<string | null>(null);

  const handleWalletClick = (walletName: string) => {
    console.log(`Connect ${walletName} clicked`);
    setNotice(`Wallet connection for ${walletName} is coming soon.`);
    setTimeout(() => setNotice(null), 3000);
  };

  const wallets = [
    { name: "MetaMask", icon: "🦊" },
    { name: "Coinbase Wallet", icon: "🔵" },
    { name: "Phantom", icon: "👻" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(
        "max-w-md",
        theme === "arcade90s" 
          ? "bg-arc-bg border-arc-border rounded-none" 
          : "bg-brand-card border-brand-border"
      )}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className={cn(
              "text-lg uppercase tracking-widest",
              theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-white"
            )}>
              Connect Crypto Wallet
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className={cn(
                "h-6 w-6",
                theme === "arcade90s" ? "text-arc-muted hover:text-arc-text" : "text-brand-muted hover:text-white"
              )}
              data-testid="button-close-wallet-modal"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <DialogDescription className={cn(
            "text-sm mt-2",
            theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted"
          )}>
            Choose a wallet provider to connect. (Demo mode – no real on-chain transactions yet.)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {wallets.map((wallet) => (
            <Button
              key={wallet.name}
              variant="outline"
              className={cn(
                "w-full justify-start text-left py-4",
                theme === "arcade90s" 
                  ? "rounded-none border-arc-border text-arc-text hover:border-arc-primary hover:bg-arc-primary/10" 
                  : "hover:border-brand-gold hover:bg-brand-gold/10"
              )}
              onClick={() => handleWalletClick(wallet.name)}
              data-testid={`button-connect-${wallet.name.toLowerCase().replace(' ', '-')}`}
            >
              <span className="mr-3 text-xl">{wallet.icon}</span>
              <span className="font-semibold">{wallet.name}</span>
            </Button>
          ))}
        </div>

        {notice && (
          <div className={cn(
            "mt-4 p-3 text-xs text-center rounded border",
            theme === "arcade90s" 
              ? "bg-arc-secondary/10 border-arc-secondary/30 text-arc-secondary font-mono" 
              : "bg-brand-gold/10 border-brand-gold/30 text-brand-gold"
          )}>
            {notice}
          </div>
        )}

        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            onClick={onClose}
            className={cn(
              "text-sm",
              theme === "arcade90s" ? "text-arc-muted hover:text-arc-text" : "text-brand-muted hover:text-white"
            )}
            data-testid="button-cancel-wallet-modal"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
