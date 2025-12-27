import { useState, FormEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { Shield, LogIn } from "lucide-react";

export default function AppAdminLogin() {
  const { theme } = useTheme();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed");
      } else {
        setLocation("/app/admin");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const cardClasses = cn(
    "w-full max-w-md",
    theme === "arcade90s"
      ? "arcade-panel border-arc-border rounded-none"
      : "bg-brand-card border-brand-border"
  );

  const inputClasses = cn(
    "w-full px-4 py-3 text-sm border rounded",
    theme === "arcade90s"
      ? "bg-arc-bg border-arc-border text-arc-text rounded-none placeholder:text-arc-muted"
      : "bg-brand-bg border-brand-border text-white placeholder:text-brand-muted"
  );

  const labelClasses = cn(
    "text-xs font-medium uppercase tracking-wide mb-2 block",
    theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted"
  );

  const titleClasses = cn(
    "text-xl font-bold flex items-center gap-2",
    theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-gold"
  );

  const bgClasses = cn(
    "min-h-screen flex items-center justify-center p-4",
    theme === "arcade90s" ? "bg-arc-bg" : "bg-brand-bg"
  );

  return (
    <div className={bgClasses} data-testid="admin-login-page">
      <Card className={cardClasses}>
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <Shield 
              className={cn(
                "w-12 h-12",
                theme === "arcade90s" ? "text-arc-primary" : "text-brand-gold"
              )} 
            />
          </div>
          <CardTitle className={titleClasses}>
            Admin Login
          </CardTitle>
          <p className={cn(
            "text-sm mt-2",
            theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
          )}>
            Sign in to access the admin panel
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClasses}>Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClasses}
                placeholder="admin@example.com"
                required
                data-testid="input-admin-email"
              />
            </div>
            <div>
              <label className={labelClasses}>Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClasses}
                placeholder="••••••••"
                required
                data-testid="input-admin-password"
              />
            </div>

            {error && (
              <div 
                className={cn(
                  "p-3 text-sm rounded",
                  theme === "arcade90s"
                    ? "bg-red-900/30 text-red-400 border border-red-500/50 rounded-none"
                    : "bg-red-900/30 text-red-400 border border-red-500/50"
                )}
                data-testid="text-admin-login-error"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full py-3 font-medium",
                theme === "arcade90s"
                  ? "bg-arc-primary text-black hover:bg-arc-secondary rounded-none arcade-pixel-font"
                  : "bg-brand-gold text-black hover:bg-brand-gold/90"
              )}
              data-testid="button-admin-login"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⟳</span>
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  Sign in as Admin
                </span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
