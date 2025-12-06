import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/theme-context";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerifyPage() {
  const { theme } = useTheme();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const token = params.get("token");
    const error = params.get("error");

    // Handle error query params from backend redirect
    if (error) {
      setStatus("error");
      if (error === "expired") {
        setMessage("This verification link has expired. Please request a new one.");
      } else if (error === "invalid") {
        setMessage("Invalid verification link.");
      } else {
        setMessage("Verification failed. Please try again.");
      }
      return;
    }

    if (!token) {
      setStatus("error");
      setMessage("No verification token provided");
      return;
    }

    // Call the POST endpoint for verification
    const verifyToken = async () => {
      try {
        const res = await fetch('/api/brokers/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });
        
        if (res.ok) {
          setStatus("success");
          setMessage("Email verified successfully! Redirecting to your console...");
          setTimeout(() => setLocation("/app/loads"), 2000);
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          setMessage(data.error || "Verification failed. The link may be invalid or expired.");
        }
      } catch (err) {
        setStatus("error");
        setMessage("Verification failed. Please try again.");
      }
    };

    verifyToken();
  }, [searchString, setLocation]);

  return (
    <div className={cn(
      "min-h-screen flex flex-col items-center justify-center p-4",
      theme === "arcade90s" ? "arcade-bg" : "bg-brand-bg"
    )}>
      {theme === "arcade90s" && (
        <div className="absolute inset-0 pointer-events-none arcade-scanline arcade-scanline-active opacity-20" />
      )}

      <div className={cn(
        "max-w-md w-full p-8 rounded-xl border text-center",
        theme === "arcade90s" 
          ? "arcade-panel border-arc-border shadow-[0_0_30px_rgba(34,211,238,0.2)]" 
          : "bg-brand-card border-brand-border"
      )}>
        {status === "loading" && (
          <>
            <Loader2 className={cn("w-16 h-16 mx-auto mb-4 animate-spin", theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold")} />
            <h1 className={cn("text-xl font-bold mb-2", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white")}>
              Verifying...
            </h1>
            <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
              Please wait while we verify your email.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className={cn("w-16 h-16 mx-auto mb-4", theme === "arcade90s" ? "text-arc-primary" : "text-emerald-500")} />
            <h1 className={cn("text-xl font-bold mb-2", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white")}>
              Email Verified!
            </h1>
            <p className={cn("text-sm mb-4", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
              {message}
            </p>
            <Button 
              onClick={() => setLocation("/app/loads")}
              className={cn(theme === "arcade90s" ? "bg-arc-secondary text-black rounded-none" : "bg-brand-gold text-black")}
            >
              Go to Console
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className={cn("w-16 h-16 mx-auto mb-4", theme === "arcade90s" ? "text-red-500" : "text-red-500")} />
            <h1 className={cn("text-xl font-bold mb-2", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white")}>
              Verification Failed
            </h1>
            <p className={cn("text-sm mb-4", theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted")}>
              {message}
            </p>
            <Button 
              onClick={() => setLocation("/")}
              variant="outline"
              className={cn(theme === "arcade90s" ? "border-arc-border text-arc-text rounded-none" : "")}
            >
              Back to Home
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
