import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { Webhook, Satellite, Radio, Save, Loader2 } from "lucide-react";
import { BackToLoadsButton } from "@/components/ui/back-to-loads-button";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface WebhookConfig {
  enabled: boolean;
  url: string | null;
}

export default function AppIntegrations() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState(false);

  const { data: webhookConfig, isLoading: isLoadingConfig } = useQuery<WebhookConfig>({
    queryKey: ["/api/integrations/webhook"],
  });

  useEffect(() => {
    if (webhookConfig) {
      setWebhookEnabled(webhookConfig.enabled);
      setWebhookUrl(webhookConfig.url || "");
    }
  }, [webhookConfig]);

  const saveWebhookMutation = useMutation({
    mutationFn: async (data: { enabled: boolean; url: string | null }) => {
      const res = await fetch("/api/integrations/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save webhook settings");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Webhook settings saved");
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/webhook"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSaveWebhook = () => {
    saveWebhookMutation.mutate({
      enabled: webhookEnabled,
      url: webhookUrl || null,
    });
  };

  const inputClasses = cn(
    "w-full px-3 py-2 text-sm border rounded",
    theme === "arcade90s" 
      ? "bg-arc-bg border-arc-border text-arc-text rounded-none font-mono" 
      : "bg-brand-bg border-brand-border text-white font-mono"
  );

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

        <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
              <Webhook className="w-4 h-4" /> Webhooks
            </CardTitle>
            <Switch 
              checked={webhookEnabled} 
              onCheckedChange={setWebhookEnabled}
              disabled={isLoadingConfig}
              data-testid="switch-webhook-enabled"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
              PingPoint will send signed JSON POST requests to your URL when loads are created, updated, or completed.
            </p>
            
            <div>
              <label className={cn("text-xs font-medium uppercase tracking-wide mb-1 block", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Your Webhook URL
              </label>
              <Input
                className={inputClasses}
                placeholder="https://your-server.com/webhook/pingpoint"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                disabled={isLoadingConfig}
                data-testid="input-webhook-url"
              />
            </div>

            <Button
              onClick={handleSaveWebhook}
              disabled={saveWebhookMutation.isPending || isLoadingConfig}
              className={cn(
                "w-full",
                theme === "arcade90s"
                  ? "bg-arc-secondary text-black hover:bg-arc-secondary/80 rounded-none"
                  : "bg-brand-gold text-black hover:bg-brand-gold/80"
              )}
              data-testid="button-save-webhook"
            >
              {saveWebhookMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Webhook Settings
            </Button>

            <div className={cn("p-3 rounded border text-xs", theme === "arcade90s" ? "bg-arc-bg border-arc-border" : "bg-brand-dark-pill border-brand-border")}>
              <p className={cn("font-medium mb-2", theme === "arcade90s" ? "text-arc-text" : "text-white")}>
                Webhook Events
              </p>
              <ul className={cn("space-y-1", theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted font-mono")}>
                <li>pingpoint.load.created</li>
                <li>pingpoint.load.updated</li>
                <li>pingpoint.status.changed</li>
                <li>pingpoint.load.completed</li>
              </ul>
            </div>
          </CardContent>
        </Card>

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
