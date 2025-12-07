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
  const [brokerEmail, setBrokerEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [timezone, setTimezone] = useState("Central (CT)");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await api.brokers.getProfile();
        setBrokerName(profile.name || "");
        setBrokerEmail(profile.email || "");
        setContactPhone(profile.phone || "");
        setTimezone(profile.timezone || "Central (CT)");
      } catch (e) {
        console.log("No active session");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Note: email is not editable for security reasons
      await api.brokers.updateProfile({
        name: brokerName,
        phone: contactPhone,
        timezone: timezone,
      });
      toast.success("Settings saved");
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

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted")}>
            Loading...
          </div>
        </div>
      </AppLayout>
    );
  }

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
                data-testid="input-broker-name"
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                className={inputClasses}
                placeholder="e.g. Acme Logistics"
              />
            </div>

            <div className="space-y-2">
              <label className={cn("text-xs font-bold uppercase tracking-wide", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Broker Email
              </label>
              <Input 
                data-testid="input-broker-email"
                type="email"
                value={brokerEmail}
                onChange={(e) => setBrokerEmail(e.target.value)}
                className={inputClasses}
                placeholder="dispatch@yourcompany.com"
              />
            </div>

            <div className="space-y-2">
              <label className={cn("text-xs font-bold uppercase tracking-wide", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
                Contact Phone
              </label>
              <Input 
                data-testid="input-contact-phone"
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
                data-testid="select-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={cn("w-full h-10 px-3 py-2 border rounded-md text-sm", inputClasses)}
              >
                <option value="Eastern (ET)">Eastern (ET)</option>
                <option value="Central (CT)">Central (CT)</option>
                <option value="Mountain (MT)">Mountain (MT)</option>
                <option value="Pacific (PT)">Pacific (PT)</option>
              </select>
            </div>

            <Button 
              data-testid="button-save-settings"
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
