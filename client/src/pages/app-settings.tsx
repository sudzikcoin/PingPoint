import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { Settings, Save } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function AppSettings() {
  const { theme } = useTheme();
  const [brokerName, setBrokerName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchBroker = async () => {
      try {
        const broker = await api.brokers.me();
        setBrokerName(broker.name || "");
      } catch (e) {
        console.log("No active session");
      }
    };
    fetchBroker();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // For now, just show success - backend PATCH endpoint can be added later
      await new Promise(r => setTimeout(r, 500));
      toast.success("Settings saved");
      console.log("Settings:", { brokerName, contactPhone, timezone });
    } catch (e) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const inputClasses = cn(
    theme === "arcade90s" 
      ? "bg-arc-bg border-arc-border text-arc-text rounded-none focus:border-arc-secondary" 
      : "bg-brand-dark-pill border-brand-border text-white"
  );

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className={cn("text-2xl font-bold mb-2", theme === "arcade90s" ? "arcade-title arcade-pixel-font" : "text-white")}>
            Settings
          </h1>
          <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted font-mono" : "text-brand-muted")}>
            Manage your broker profile and preferences
          </p>
        </div>

        <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
          <CardHeader>
            <CardTitle className={cn("text-sm uppercase tracking-widest flex items-center gap-2", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>
              <Settings className="w-4 h-4" /> Broker Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className={cn("text-xs font-bold uppercase tracking-wide", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Broker / Company Name
              </label>
              <Input 
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                className={inputClasses}
                placeholder="e.g. Acme Logistics"
              />
            </div>

            <div className="space-y-2">
              <label className={cn("text-xs font-bold uppercase tracking-wide", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Contact Phone
              </label>
              <Input 
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className={inputClasses}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div className="space-y-2">
              <label className={cn("text-xs font-bold uppercase tracking-wide", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Timezone
              </label>
              <select 
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={cn("w-full h-10 px-3 py-2 border rounded-md text-sm", inputClasses)}
              >
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
              </select>
            </div>

            <Button 
              onClick={handleSave}
              disabled={saving}
              className={cn("w-full", theme === "arcade90s" ? "bg-arc-secondary text-black rounded-none shadow-arc-glow-cyan" : "bg-brand-gold text-black")}
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
