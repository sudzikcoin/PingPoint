import { api } from "@/lib/api";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createLoad, Load, Stop } from "@/lib/mock-data";
import { useLocation } from "wouter";
import { useState } from "react";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { ensureBrokerWorkspace } from "@/lib/brokerWorkspace";
import { sendBrokerVerificationEmail, sendDriverAppLink } from "@/lib/notifications";

export default function AppLoadNew() {
  const [, setLocation] = useLocation();
  const { theme } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Collect form data (mock implementation)
    const formData = new FormData(e.currentTarget);
    
    const brokerName = formData.get("brokerName") as string;
    const brokerEmail = formData.get("brokerEmail") as string;
    const driverPhone = formData.get("driverPhone") as string;

    // Basic validation
    if (!brokerEmail || !brokerEmail.includes("@")) {
      toast.error("Please enter a valid broker email");
      setIsSubmitting(false);
      return;
    }

    if (!driverPhone) {
      toast.error("Please enter a driver phone number");
      setIsSubmitting(false);
      return;
    }

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 1. Ensure Workspace via API
      const workspace = await api.brokers.ensure(brokerEmail, brokerName);
      
      // 2. Create Load via API
      const newLoad = await api.loads.create({
        brokerName: brokerName,
        brokerEmail: brokerEmail,
        driverPhone: driverPhone,
        shipperName: formData.get("shipperName") as string,
        carrierName: formData.get("carrierName") as string,
        equipmentType: formData.get("equipmentType") as string,
        rateAmount: Number(formData.get("rateAmount")),
        customerReference: formData.get("customerReference") as string,
        internalReference: formData.get("internalReference") as string,
        stops: [
          {
            id: `stop_${Date.now()}_1`,
            type: "PICKUP",
            sequence: 1,
            name: formData.get("pickupName") as string,
            addressLine1: formData.get("pickupAddress") as string,
            city: formData.get("pickupCity") as string,
            state: formData.get("pickupState") as string,
            zip: formData.get("pickupZip") as string,
            windowStart: new Date().toISOString(), // Mock
            windowEnd: new Date().toISOString(),   // Mock
            status: "PLANNED"
          },
          {
            id: `stop_${Date.now()}_2`,
            type: "DELIVERY",
            sequence: 2,
            name: formData.get("deliveryName") as string,
            addressLine1: formData.get("deliveryAddress") as string,
            city: formData.get("deliveryCity") as string,
            state: formData.get("deliveryState") as string,
            zip: formData.get("deliveryZip") as string,
            windowStart: new Date().toISOString(), // Mock
            windowEnd: new Date().toISOString(),   // Mock
            status: "PLANNED"
          }
        ]
      });

      // 3. Notifications are handled inside api.loads.create now

      // 4. UI Feedback & Redirect
      toast.success(`Load created! Verification email sent to ${brokerEmail}`);
      toast.info(`Driver app link sent to ${driverPhone}`);
      
      // Redirect to loads dashboard
      setLocation(`/app/loads?workspace=${workspace.id}`);
    
    } catch (error) {
      console.error("Failed to create load", error);
      toast.error("Failed to create load. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClasses = cn(
    theme === "arcade90s" 
      ? "bg-arc-bg border-arc-border text-arc-text rounded-none focus:border-arc-secondary focus:ring-arc-secondary/50 placeholder:text-arc-muted/50 arcade-pixel-font text-xs" 
      : "bg-brand-bg border-brand-border text-white focus:border-brand-gold focus:ring-brand-gold/50"
  );

  const labelClasses = cn(
    "text-xs font-medium uppercase tracking-wide mb-2 block",
    theme === "arcade90s" ? "text-arc-muted arcade-pixel-font" : "text-brand-muted"
  );

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation("/app/loads")}
            className={cn(theme === "arcade90s" ? "text-arc-secondary hover:bg-arc-secondary/10 rounded-none" : "text-brand-muted hover:text-white")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className={cn("text-2xl font-bold", theme === "arcade90s" ? "arcade-title arcade-pixel-font" : "text-white")}>
              New Load
            </h1>
            <p className={cn("text-sm", theme === "arcade90s" ? "text-arc-muted font-mono text-xs" : "text-brand-muted")}>
              Create a new shipment
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* General Info */}
          <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-border rounded-none" : "bg-brand-card border-brand-border")}>
            <CardHeader>
              <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-primary arcade-pixel-font" : "text-brand-text")}>General Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className={labelClasses}>Broker Name</label>
                <Input name="brokerName" required className={inputClasses} placeholder="e.g. Soar Transportation" />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Broker Email</label>
                <Input name="brokerEmail" type="email" required className={inputClasses} placeholder="e.g. dispatch@soartransport.com" />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Driver Phone</label>
                <Input name="driverPhone" type="tel" required className={inputClasses} placeholder="e.g. +1 (555) 123-4567" />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Shipper Name</label>
                <Input name="shipperName" required className={inputClasses} placeholder="e.g. General Mills" />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Carrier Name</label>
                <Input name="carrierName" required className={inputClasses} placeholder="e.g. Best Carrier LLC" />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Equipment Type</label>
                <select name="equipmentType" className={cn("w-full h-10 px-3 py-2 border rounded-md text-sm", inputClasses)}>
                  <option value="VAN">Dry Van</option>
                  <option value="REEFER">Reefer</option>
                  <option value="FLATBED">Flatbed</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Customer Ref</label>
                <Input name="customerReference" className={inputClasses} placeholder="Optional PO #" />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Rate Amount ($)</label>
                <Input name="rateAmount" type="number" className={inputClasses} placeholder="0.00" />
              </div>
            </CardContent>
          </Card>

          {/* Route */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pickup */}
            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-secondary/30 rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", theme === "arcade90s" ? "bg-arc-primary" : "bg-emerald-500")} />
                  <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-brand-text")}>Pickup</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <label className={labelClasses}>Facility Name</label>
                  <Input name="pickupName" required className={inputClasses} />
                </div>
                <div className="space-y-1">
                  <label className={labelClasses}>Address</label>
                  <Input name="pickupAddress" required className={inputClasses} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={labelClasses}>City</label>
                    <Input name="pickupCity" required className={inputClasses} />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClasses}>State</label>
                    <Input name="pickupState" required className={inputClasses} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={labelClasses}>ZIP</label>
                  <Input name="pickupZip" required className={inputClasses} />
                </div>
              </CardContent>
            </Card>

            {/* Delivery */}
            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-secondary/30 rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", theme === "arcade90s" ? "bg-arc-secondary" : "bg-brand-gold")} />
                  <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-brand-text")}>Delivery</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <label className={labelClasses}>Facility Name</label>
                  <Input name="deliveryName" required className={inputClasses} />
                </div>
                <div className="space-y-1">
                  <label className={labelClasses}>Address</label>
                  <Input name="deliveryAddress" required className={inputClasses} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={labelClasses}>City</label>
                    <Input name="deliveryCity" required className={inputClasses} />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClasses}>State</label>
                    <Input name="deliveryState" required className={inputClasses} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={labelClasses}>ZIP</label>
                  <Input name="deliveryZip" required className={inputClasses} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end pt-4">
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className={cn(
                "w-full md:w-auto px-8",
                theme === "arcade90s" 
                  ? "bg-arc-secondary text-black rounded-none shadow-arc-glow-cyan hover:bg-arc-secondary/90 arcade-pixel-font font-bold" 
                  : "bg-brand-gold text-black hover:bg-brand-gold/90"
              )}
            >
              {isSubmitting ? "Creating..." : "Create Load"}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
