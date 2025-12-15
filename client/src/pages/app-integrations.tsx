import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { Webhook, Satellite, Radio } from "lucide-react";
import { BackToLoadsButton } from "@/components/ui/back-to-loads-button";
import { useState } from "react";
import { toast } from "sonner";

export default function AppIntegrations() {
  const { theme } = useTheme();
  const [webhooksEnabled, setWebhooksEnabled] = useState(false);

  const handleToggle = (name: string, enabled: boolean) => {
    if (name === "webhooks") {
      setWebhooksEnabled(enabled);
      toast.success(enabled ? "Webhooks enabled" : "Webhooks disabled");
    } else {
      toast.info(`${name} integration coming soon`);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <BackToLoadsButton />
          <div>
            <h1 className={cn("text-2xl font-bold", theme === "arcade90s" ? "arcade-title arcade-pixel-font" : "text-white")}>
              Integrations
            </h1>
            <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted")}>
              Connect PingPoint to external systems and services
            </p>
          </div>
        </div>

        {/* Webhooks */}
        <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
              <Webhook className="w-4 h-4" /> Webhooks
            </CardTitle>
            <Switch 
              checked={webhooksEnabled} 
              onCheckedChange={(checked) => handleToggle("webhooks", checked)}
            />
          </CardHeader>
          <CardContent>
            <p className={cn("text-sm mb-3", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
              Receive real-time notifications when load status changes.
            </p>
            <div className={cn("p-3 rounded border text-xs font-mono", theme === "arcade90s" ? "bg-arc-bg border-arc-border text-arc-muted" : "bg-brand-dark-pill border-brand-border text-brand-muted")}>
              <p className="mb-1">Your webhook URL:</p>
              <p className="opacity-50">(Coming soon)</p>
            </div>
          </CardContent>
        </Card>

        {/* Telematics Providers */}
        <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
          <CardHeader>
            <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
              <Satellite className="w-4 h-4" /> Telematics Providers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { name: "MacroPoint", status: "Planned" },
              { name: "Project44", status: "Planned" },
              { name: "FourKites", status: "Planned" },
            ].map((provider) => (
              <div key={provider.name} className="flex items-center justify-between">
                <div>
                  <p className={cn("font-medium", theme === "arcade90s" ? "text-arc-text" : "text-white")}>{provider.name}</p>
                  <p className={cn("text-xs", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>{provider.status}</p>
                </div>
                <Switch disabled />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* TMS Integrations */}
        <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
          <CardHeader>
            <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
              <Radio className="w-4 h-4" /> TMS Integrations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
              Connect to your existing TMS for automated load import/export. Contact us for custom integrations.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
