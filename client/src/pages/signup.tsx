import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/theme-context";
import { UserPlus, Mail, User, Loader2, CheckCircle2, ArrowRight, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type SignupStatus = "idle" | "loading" | "success" | "error";

export default function SignupPage() {
  const { theme } = useTheme();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<SignupStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const ref = params.get("ref");
    if (ref) {
      const code = ref.toUpperCase();
      setReferralCode(code);
      fetch("/api/referrals/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      }).catch(err => console.error("Failed to track referral:", err));
    }
  }, [searchString]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setStatus("loading");

    try {
      const result = await api.brokers.signup(
        email.trim().toLowerCase(),
        name.trim() || "Broker",
        referralCode || undefined
      );

      if (result.code === "ACCOUNT_CREATED") {
        setStatus("success");
        setSuccessMessage(result.message);
      }
    } catch (err: any) {
      setStatus("error");
      if (err.code === "ACCOUNT_ALREADY_EXISTS") {
        setErrorMessage("An account with this email already exists. Please log in instead.");
      } else {
        setErrorMessage(err.message || "Failed to create account. Please try again.");
      }
    }
  };

  return (
    <div className={cn(
      "min-h-screen flex flex-col items-center justify-center p-4",
      theme === "arcade90s" ? "arcade-bg" : "bg-brand-bg"
    )}>
      {theme === "arcade90s" && (
        <div className="absolute inset-0 pointer-events-none arcade-scanline arcade-scanline-active opacity-20" />
      )}

      <div className={cn(
        "max-w-md w-full p-8 rounded-xl border",
        theme === "arcade90s" 
          ? "arcade-panel border-arc-border shadow-[0_0_30px_rgba(34,211,238,0.2)]" 
          : "bg-brand-card border-brand-border"
      )}>
        {status === "idle" || status === "loading" || status === "error" ? (
          <>
            <div className="flex items-center justify-center mb-6">
              <UserPlus className={cn("w-10 h-10", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")} />
            </div>
            <h1 className={cn(
              "text-2xl font-bold text-center mb-2",
              theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white"
            )} data-testid="text-signup-title">
              Create Account
            </h1>
            <p className={cn(
              "text-center text-sm mb-6",
              theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
            )}>
              Get started with PingPoint tracking
            </p>

            {referralCode && (
              <div className={cn(
                "flex items-center justify-center gap-2 p-3 rounded-lg mb-4 border",
                theme === "arcade90s" 
                  ? "bg-arc-secondary/10 border-arc-secondary/30 text-arc-secondary" 
                  : "bg-brand-gold/10 border-brand-gold/30 text-brand-gold"
              )} data-testid="referral-banner">
                <Gift className="w-4 h-4" />
                <span className="text-sm font-medium">You'll get 10 free loads when you subscribe to PRO!</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={cn(
                  "block text-sm font-medium mb-1",
                  theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
                )}>
                  Your Name (optional)
                </label>
                <div className="relative">
                  <User className={cn(
                    "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4",
                    theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
                  )} />
                  <Input
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={status === "loading"}
                    data-testid="input-signup-name"
                    className={cn(
                      "pl-10",
                      theme === "arcade90s" 
                        ? "bg-brand-bg border-arc-border text-arc-text rounded-none focus:border-arc-secondary" 
                        : "bg-brand-bg border-brand-border text-white focus:border-brand-gold"
                    )}
                  />
                </div>
              </div>

              <div>
                <label className={cn(
                  "block text-sm font-medium mb-1",
                  theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
                )}>
                  Email Address
                </label>
                <div className="relative">
                  <Mail className={cn(
                    "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4",
                    theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
                  )} />
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={status === "loading"}
                    data-testid="input-signup-email"
                    className={cn(
                      "pl-10",
                      theme === "arcade90s" 
                        ? "bg-brand-bg border-arc-border text-arc-text rounded-none focus:border-arc-secondary" 
                        : "bg-brand-bg border-brand-border text-white focus:border-brand-gold"
                    )}
                  />
                </div>
              </div>

              {errorMessage && (
                <div className="space-y-2">
                  <p className="text-red-500 text-sm" data-testid="text-signup-error">{errorMessage}</p>
                  {errorMessage.includes("already exists") && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLocation("/login")}
                      className={cn(
                        "w-full",
                        theme === "arcade90s" ? "border-arc-border text-arc-text rounded-none" : ""
                      )}
                      data-testid="button-goto-login"
                    >
                      Go to Login
                    </Button>
                  )}
                </div>
              )}

              <Button
                type="submit"
                disabled={status === "loading" || !email.trim()}
                data-testid="button-signup-submit"
                className={cn(
                  "w-full",
                  theme === "arcade90s" 
                    ? "bg-arc-secondary text-black rounded-none hover:bg-arc-primary" 
                    : "bg-brand-gold text-black hover:bg-brand-gold/90"
                )}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className={cn(
                "text-sm",
                theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
              )}>
                Already have an account?{" "}
                <button
                  onClick={() => setLocation("/login")}
                  className={cn(
                    "underline",
                    theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold"
                  )}
                  data-testid="link-login"
                >
                  Log in
                </button>
              </p>
            </div>
          </>
        ) : status === "success" && (
          <>
            <div className="flex items-center justify-center mb-6">
              <CheckCircle2 className={cn("w-16 h-16", theme === "arcade90s" ? "text-arc-primary" : "text-emerald-500")} />
            </div>
            <h1 className={cn(
              "text-xl font-bold text-center mb-2",
              theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white"
            )} data-testid="text-signup-success">
              Check Your Email
            </h1>
            <p className={cn(
              "text-center text-sm mb-4",
              theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
            )}>
              {successMessage}
            </p>
            <p className={cn(
              "text-center text-xs mb-6",
              theme === "arcade90s" ? "text-arc-muted/70" : "text-brand-muted/70"
            )}>
              We sent a verification link to <strong className={theme === "arcade90s" ? "text-arc-text" : "text-white"}>{email}</strong>
            </p>
            <Button
              onClick={() => setLocation("/login")}
              variant="outline"
              className={cn(
                "w-full",
                theme === "arcade90s" ? "border-arc-border text-arc-text rounded-none" : ""
              )}
              data-testid="button-goto-login-after-signup"
            >
              Go to Login
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
