import { api } from "@/lib/api";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TypeaheadInput } from "@/components/ui/typeahead-input";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function AppLoadNew() {
  const [, setLocation] = useLocation();
  const { theme } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state with profile prefill
  const [brokerName, setBrokerName] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [shipperName, setShipperName] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [equipmentType, setEquipmentType] = useState("VAN");
  const [customerRef, setCustomerRef] = useState("");
  const [rateAmount, setRateAmount] = useState("");

  // Pickup stop
  const [pickupName, setPickupName] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupCity, setPickupCity] = useState("");
  const [pickupState, setPickupState] = useState("");
  const [pickupZip, setPickupZip] = useState("");

  // Delivery stop
  const [deliveryName, setDeliveryName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");

  // Fetch broker profile on mount to prefill form
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await api.brokers.getProfile();
        setBrokerName(profile.name || "");
        setBrokerEmail(profile.email || "");
        setDriverPhone(profile.phone || "");
      } catch (e) {
        // No session - that's okay, user will fill in manually
        console.log("No active session for prefill");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

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
      // Create Load via API (backend handles broker creation/lookup)
      const newLoad = await api.loads.create({
        brokerName,
        brokerEmail,
        brokerPhone: driverPhone,
        driverPhone,
        shipperName,
        carrierName,
        equipmentType,
        rateAmount: Number(rateAmount) || 0,
        customerRef,
        stops: [
          {
            type: "PICKUP",
            sequence: 1,
            name: pickupName,
            addressLine1: pickupAddress,
            city: pickupCity,
            state: pickupState,
            zip: pickupZip,
            windowStart: new Date().toISOString(),
            windowEnd: new Date().toISOString(),
            status: "PLANNED"
          },
          {
            type: "DELIVERY",
            sequence: 2,
            name: deliveryName,
            addressLine1: deliveryAddress,
            city: deliveryCity,
            state: deliveryState,
            zip: deliveryZip,
            windowStart: new Date().toISOString(),
            windowEnd: new Date().toISOString(),
            status: "PLANNED"
          }
        ]
      });

      // UI Feedback & Redirect
      toast.success(`Load ${newLoad.loadNumber} created!`);
      toast.info(`Verification email sent to ${brokerEmail}`);
      
      setLocation(`/app/loads`);
    
    } catch (error: any) {
      console.error("Failed to create load", error);
      
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        toast.error("Please verify your email first!");
        toast.info(`Check your inbox at ${error.email || brokerEmail} for a verification link.`);
      } else if (error.code === 'BROKER_EMAIL_REQUIRED') {
        toast.error("Please enter a valid email address.");
      } else {
        // Show the specific error message from the backend
        toast.error(error.message || "Failed to create load. Please try again.");
      }
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
                <Input 
                  data-testid="input-broker-name"
                  value={brokerName}
                  onChange={(e) => setBrokerName(e.target.value)}
                  required 
                  className={inputClasses} 
                  placeholder="e.g. Soar Transportation" 
                />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Broker Email</label>
                <Input 
                  data-testid="input-broker-email"
                  type="email"
                  value={brokerEmail}
                  onChange={(e) => setBrokerEmail(e.target.value)}
                  required 
                  className={inputClasses} 
                  placeholder="e.g. dispatch@soartransport.com" 
                />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Driver Phone</label>
                <Input 
                  data-testid="input-driver-phone"
                  type="tel"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  required 
                  className={inputClasses} 
                  placeholder="e.g. +1 (555) 123-4567" 
                />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Shipper Name</label>
                <TypeaheadInput 
                  data-testid="input-shipper-name"
                  fieldKey="shipperName"
                  value={shipperName}
                  onValueChange={setShipperName}
                  className={inputClasses} 
                  placeholder="e.g. General Mills" 
                />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Carrier Name</label>
                <TypeaheadInput 
                  data-testid="input-carrier-name"
                  fieldKey="carrierName"
                  value={carrierName}
                  onValueChange={setCarrierName}
                  className={inputClasses} 
                  placeholder="e.g. Best Carrier LLC" 
                />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Equipment Type</label>
                <select 
                  data-testid="select-equipment-type"
                  value={equipmentType}
                  onChange={(e) => setEquipmentType(e.target.value)}
                  className={cn("w-full h-10 px-3 py-2 border rounded-md text-sm", inputClasses)}
                >
                  <option value="VAN">Dry Van</option>
                  <option value="REEFER">Reefer</option>
                  <option value="FLATBED">Flatbed</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Customer Ref</label>
                <TypeaheadInput 
                  data-testid="input-customer-ref"
                  fieldKey="customerRef"
                  value={customerRef}
                  onValueChange={setCustomerRef}
                  className={inputClasses} 
                  placeholder="Optional PO #" 
                />
              </div>
              <div className="space-y-1">
                <label className={labelClasses}>Rate Amount ($)</label>
                <Input 
                  data-testid="input-rate-amount"
                  type="number"
                  value={rateAmount}
                  onChange={(e) => setRateAmount(e.target.value)}
                  className={inputClasses} 
                  placeholder="0.00" 
                />
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
                  <TypeaheadInput 
                    data-testid="input-pickup-name"
                    fieldKey="pickupName"
                    value={pickupName}
                    onValueChange={setPickupName}
                    required 
                    className={inputClasses} 
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClasses}>Address</label>
                  <Input 
                    data-testid="input-pickup-address"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    required 
                    className={inputClasses} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={labelClasses}>City</label>
                    <TypeaheadInput 
                      data-testid="input-pickup-city"
                      fieldKey="pickupCity"
                      value={pickupCity}
                      onValueChange={setPickupCity}
                      required 
                      className={inputClasses} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClasses}>State</label>
                    <TypeaheadInput 
                      data-testid="input-pickup-state"
                      fieldKey="pickupState"
                      value={pickupState}
                      onValueChange={setPickupState}
                      required 
                      className={inputClasses} 
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={labelClasses}>ZIP</label>
                  <Input 
                    data-testid="input-pickup-zip"
                    value={pickupZip}
                    onChange={(e) => setPickupZip(e.target.value)}
                    required 
                    className={inputClasses} 
                  />
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
                  <TypeaheadInput 
                    data-testid="input-delivery-name"
                    fieldKey="deliveryName"
                    value={deliveryName}
                    onValueChange={setDeliveryName}
                    required 
                    className={inputClasses} 
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelClasses}>Address</label>
                  <Input 
                    data-testid="input-delivery-address"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    required 
                    className={inputClasses} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={labelClasses}>City</label>
                    <TypeaheadInput 
                      data-testid="input-delivery-city"
                      fieldKey="deliveryCity"
                      value={deliveryCity}
                      onValueChange={setDeliveryCity}
                      required 
                      className={inputClasses} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClasses}>State</label>
                    <TypeaheadInput 
                      data-testid="input-delivery-state"
                      fieldKey="deliveryState"
                      value={deliveryState}
                      onValueChange={setDeliveryState}
                      required 
                      className={inputClasses} 
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={labelClasses}>ZIP</label>
                  <Input 
                    data-testid="input-delivery-zip"
                    value={deliveryZip}
                    onChange={(e) => setDeliveryZip(e.target.value)}
                    required 
                    className={inputClasses} 
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end pt-4">
            <Button 
              data-testid="button-create-load"
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
