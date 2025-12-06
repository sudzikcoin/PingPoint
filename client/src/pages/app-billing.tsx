import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { CreditCard, Building2, Bitcoin, Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AppBilling() {
  const { theme } = useTheme();
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [companyName, setCompanyName] = useState("");

  const handleInvoiceRequest = () => {
    if (!invoiceEmail || !companyName) {
      toast.error("Please fill in all fields");
      return;
    }
    toast.success("Invoice request submitted! We'll be in touch.");
    console.log("Invoice request:", { companyName, invoiceEmail });
  };

  const handleCryptoPayment = () => {
    toast.info("Crypto payment notification sent. Please allow 24h for confirmation.");
    console.log("Crypto payment notification");
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card Payment */}
          <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                <CreditCard className="w-4 h-4" /> Card Payment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-sm mb-4", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Pay securely with credit or debit card via Stripe.
              </p>
              <Button 
                disabled
                className={cn("w-full", theme === "arcade90s" ? "bg-arc-bg border-arc-border text-arc-muted rounded-none" : "bg-brand-dark-pill text-brand-muted")}
              >
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          {/* Invoice/Bank */}
          <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                <Building2 className="w-4 h-4" /> Invoice / Bank
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input 
                placeholder="Company Name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={cn(theme === "arcade90s" ? "bg-arc-bg border-arc-border text-arc-text rounded-none" : "")}
              />
              <Input 
                placeholder="Billing Email"
                type="email"
                value={invoiceEmail}
                onChange={(e) => setInvoiceEmail(e.target.value)}
                className={cn(theme === "arcade90s" ? "bg-arc-bg border-arc-border text-arc-text rounded-none" : "")}
              />
              <Button 
                onClick={handleInvoiceRequest}
                className={cn("w-full", theme === "arcade90s" ? "bg-arc-secondary text-black rounded-none" : "bg-brand-gold text-black")}
              >
                Request Invoice
              </Button>
            </CardContent>
          </Card>

          {/* Crypto */}
          <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
                <Bitcoin className="w-4 h-4" /> Crypto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={cn("p-2 rounded border text-xs font-mono break-all", theme === "arcade90s" ? "bg-arc-bg border-arc-border text-arc-muted" : "bg-brand-dark-pill border-brand-border text-brand-muted")}>
                <p className="font-bold mb-1">BTC:</p>
                <p>bc1q...pingpoint</p>
              </div>
              <div className={cn("p-2 rounded border text-xs font-mono break-all", theme === "arcade90s" ? "bg-arc-bg border-arc-border text-arc-muted" : "bg-brand-dark-pill border-brand-border text-brand-muted")}>
                <p className="font-bold mb-1">ETH:</p>
                <p>0x...pingpoint</p>
              </div>
              <Button 
                onClick={handleCryptoPayment}
                variant="outline"
                className={cn("w-full", theme === "arcade90s" ? "border-arc-border text-arc-text rounded-none" : "")}
              >
                I Paid
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
