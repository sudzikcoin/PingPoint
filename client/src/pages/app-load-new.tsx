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
import { ArrowLeft, Plus, X, Upload, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface StopForm {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

const emptyStop: StopForm = {
  name: "",
  address: "",
  city: "",
  state: "",
  zip: "",
};

export default function AppLoadNew() {
  const [, setLocation] = useLocation();
  const { theme } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [limitReached, setLimitReached] = useState<{ message: string } | null>(null);

  // Form state with profile prefill
  const [brokerName, setBrokerName] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [shipperName, setShipperName] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [equipmentType, setEquipmentType] = useState("VAN");
  const [customerRef, setCustomerRef] = useState("");
  const [rateAmount, setRateAmount] = useState("");

  // Multi-stop arrays
  const [pickups, setPickups] = useState<StopForm[]>([{ ...emptyStop }]);
  const [deliveries, setDeliveries] = useState<StopForm[]>([{ ...emptyStop }]);

  // PDF parsing state
  const [isParsing, setIsParsing] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }

    setIsParsing(true);
    setPdfFileName(file.name);

    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const response = await fetch("/api/pdf/parse-rate-confirmation", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const result = await response.json();

      if (result.success && result.data) {
        const d = result.data;

        if (d.shipperName) setShipperName(d.shipperName);
        if (d.carrierName) setCarrierName(d.carrierName);
        if (d.driverPhone) setDriverPhone(d.driverPhone);
        if (d.customerRef) setCustomerRef(d.customerRef);
        if (d.rate) setRateAmount(d.rate);
        if (d.equipmentType) {
          const eqMap: Record<string, string> = {
            "DRY VAN": "VAN", "VAN": "VAN",
            "REEFER": "REEFER", "REFRIGERATED": "REEFER",
            "FLATBED": "FLATBED", "FLAT": "FLATBED"
          };
          setEquipmentType(eqMap[d.equipmentType.toUpperCase()] || "VAN");
        }

        if (d.pickupAddress || d.pickupCity || d.pickupState) {
          setPickups([{
            name: d.shipperName || "",
            address: d.pickupAddress || "",
            city: d.pickupCity || "",
            state: d.pickupState || "",
            zip: d.pickupZip || "",
          }]);
        }

        if (d.deliveryAddress || d.deliveryCity || d.deliveryState) {
          setDeliveries([{
            name: d.receiverName || "",
            address: d.deliveryAddress || "",
            city: d.deliveryCity || "",
            state: d.deliveryState || "",
            zip: d.deliveryZip || "",
          }]);
        }

        toast.success("PDF parsed successfully! Please review the form.");
      } else {
        toast.error(result.error || "Failed to parse PDF");
        setPdfFileName(null);
      }
    } catch (error: any) {
      console.error("PDF upload error:", error);
      toast.error("Error uploading PDF");
      setPdfFileName(null);
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  };

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

  const updateStop = (type: "pickups" | "deliveries", index: number, field: keyof StopForm, value: string) => {
    if (type === "pickups") {
      setPickups(prev => {
        const arr = [...prev];
        arr[index] = { ...arr[index], [field]: value };
        return arr;
      });
    } else {
      setDeliveries(prev => {
        const arr = [...prev];
        arr[index] = { ...arr[index], [field]: value };
        return arr;
      });
    }
  };

  const addStop = (type: "pickups" | "deliveries") => {
    if (type === "pickups") {
      setPickups(prev => [...prev, { ...emptyStop }]);
    } else {
      setDeliveries(prev => [...prev, { ...emptyStop }]);
    }
  };

  const removeStop = (type: "pickups" | "deliveries", index: number) => {
    if (type === "pickups") {
      setPickups(prev => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
    } else {
      setDeliveries(prev => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
    }
  };

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

    // Build stops array from pickups and deliveries
    const stops = [
      ...pickups.map((stop, index) => ({
        type: "PICKUP" as const,
        sequence: index + 1,
        name: stop.name,
        addressLine1: stop.address,
        city: stop.city,
        state: stop.state,
        zip: stop.zip,
        windowStart: new Date().toISOString(),
        windowEnd: new Date().toISOString(),
        status: "PLANNED" as const,
      })),
      ...deliveries.map((stop, index) => ({
        type: "DELIVERY" as const,
        sequence: pickups.length + index + 1,
        name: stop.name,
        addressLine1: stop.address,
        city: stop.city,
        state: stop.state,
        zip: stop.zip,
        windowStart: new Date().toISOString(),
        windowEnd: new Date().toISOString(),
        status: "PLANNED" as const,
      })),
    ];

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
        stops,
      });

      // UI Feedback & Redirect
      toast.success(`Load ${newLoad.loadNumber} created!`);
      
      setLocation(`/app/loads`);
    
    } catch (error: any) {
      console.error("Failed to create load", error);
      
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        toast.error("Please verify your email first!");
        toast.info(`Check your inbox at ${error.email || brokerEmail} for a verification link.`);
      } else if (error.code === 'BROKER_EMAIL_REQUIRED') {
        toast.error("Please enter a valid email address.");
      } else if (error.code === 'LOAD_LIMIT_REACHED') {
        toast.error("You've reached your monthly load limit.");
        toast("Buy extra load credits to continue.", {
          action: {
            label: "Go to Billing",
            onClick: () => setLocation("/app/billing"),
          },
        });
        setLimitReached({ message: error.message || "You've reached your monthly limit (3 loads). Upgrade or buy extra load credits." });
      } else {
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

  const renderStopCard = (
    type: "pickups" | "deliveries",
    stop: StopForm,
    index: number,
    total: number
  ) => {
    const isPickup = type === "pickups";
    const testIdPrefix = isPickup ? "pickup" : "delivery";
    const fieldPrefix = isPickup ? "pickupName" : "deliveryName";
    
    return (
      <div
        key={`${type}-${index}`}
        className={cn(
          "rounded-md border p-4 space-y-4",
          theme === "arcade90s" 
            ? "border-arc-border bg-arc-bg/50" 
            : "border-brand-border bg-brand-bg/30"
        )}
      >
        <div className="flex items-center justify-between">
          <span className={cn(
            "text-sm font-semibold",
            theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white"
          )}>
            {isPickup ? "Pickup" : "Delivery"} #{index + 1}
          </span>
          {total > 1 && (
            <button
              type="button"
              onClick={() => removeStop(type, index)}
              className={cn(
                "text-xs flex items-center gap-1 hover:opacity-80",
                theme === "arcade90s" ? "text-red-400" : "text-red-400"
              )}
              data-testid={`button-remove-${testIdPrefix}-${index}`}
            >
              <X className="w-3 h-3" />
              Remove
            </button>
          )}
        </div>
        
        <div className="space-y-4">
          <div className="space-y-1">
            <label className={labelClasses}>Facility Name</label>
            <TypeaheadInput 
              data-testid={`input-${testIdPrefix}-name-${index}`}
              fieldKey={fieldPrefix}
              value={stop.name}
              onValueChange={(val) => updateStop(type, index, "name", val)}
              required 
              className={inputClasses} 
            />
          </div>
          <div className="space-y-1">
            <label className={labelClasses}>Address</label>
            <Input 
              data-testid={`input-${testIdPrefix}-address-${index}`}
              value={stop.address}
              onChange={(e) => updateStop(type, index, "address", e.target.value)}
              required 
              className={inputClasses} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={labelClasses}>City</label>
              <TypeaheadInput 
                data-testid={`input-${testIdPrefix}-city-${index}`}
                fieldKey={`${testIdPrefix}City`}
                value={stop.city}
                onValueChange={(val) => updateStop(type, index, "city", val)}
                required 
                className={inputClasses} 
              />
            </div>
            <div className="space-y-1">
              <label className={labelClasses}>State</label>
              <TypeaheadInput 
                data-testid={`input-${testIdPrefix}-state-${index}`}
                fieldKey={`${testIdPrefix}State`}
                value={stop.state}
                onValueChange={(val) => updateStop(type, index, "state", val)}
                required 
                className={inputClasses} 
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelClasses}>ZIP</label>
            <Input 
              data-testid={`input-${testIdPrefix}-zip-${index}`}
              value={stop.zip}
              onChange={(e) => updateStop(type, index, "zip", e.target.value)}
              required 
              className={inputClasses} 
            />
          </div>
        </div>
      </div>
    );
  };

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

        {/* PDF Upload Section */}
        <Card className={cn(
          "border-dashed",
          theme === "arcade90s" 
            ? "arcade-panel border-arc-secondary/50 rounded-none bg-arc-bg/30" 
            : "bg-brand-card/50 border-brand-border"
        )}>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
                theme === "arcade90s" ? "bg-arc-secondary/20" : "bg-brand-gold/10"
              )}>
                <FileText className={cn(
                  "w-6 h-6",
                  theme === "arcade90s" ? "text-arc-secondary" : "text-brand-gold"
                )} />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h3 className={cn(
                  "font-semibold text-sm",
                  theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-white"
                )}>
                  Quick Fill from Rate Confirmation
                </h3>
                <p className={cn(
                  "text-xs mt-1",
                  theme === "arcade90s" ? "text-arc-muted" : "text-brand-muted"
                )}>
                  Upload a PDF and we'll extract pickup, delivery, and rate details automatically
                </p>
              </div>
              <div className="flex-shrink-0">
                <label
                  htmlFor="pdf-upload"
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 text-xs font-medium border rounded cursor-pointer transition-colors",
                    isParsing && "opacity-50 cursor-not-allowed",
                    theme === "arcade90s"
                      ? "border-arc-secondary text-arc-secondary hover:bg-arc-secondary/10 rounded-none arcade-pixel-font"
                      : "border-brand-gold text-brand-gold hover:bg-brand-gold/10"
                  )}
                  data-testid="button-upload-pdf"
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload PDF
                    </>
                  )}
                </label>
                <input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handlePdfUpload}
                  disabled={isParsing}
                  className="hidden"
                  data-testid="input-pdf-file"
                />
              </div>
            </div>
            {pdfFileName && !isParsing && (
              <div className={cn(
                "mt-3 text-xs flex items-center gap-2",
                theme === "arcade90s" ? "text-arc-primary" : "text-emerald-400"
              )}>
                <FileText className="w-4 h-4" />
                Parsed: {pdfFileName}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Limit Reached Banner */}
        {limitReached && (
          <div className={cn(
            "p-4 rounded-lg border flex flex-col gap-2",
            theme === "arcade90s"
              ? "bg-red-900/30 border-red-500/50 text-red-300"
              : "bg-red-900/20 border-red-500/30 text-red-400"
          )}>
            <div className={cn("font-bold text-sm uppercase tracking-wide", theme === "arcade90s" ? "arcade-pixel-font" : "")}>
              Free Plan Limit Reached
            </div>
            <p className="text-sm">{limitReached.message}</p>
            <Button
              type="button"
              onClick={() => setLocation("/app/billing")}
              className={cn(
                "w-fit mt-2",
                theme === "arcade90s"
                  ? "bg-arc-primary text-black rounded-none arcade-pixel-font text-xs"
                  : "bg-brand-gold text-black"
              )}
            >
              Go to Billing
            </Button>
          </div>
        )}

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

          {/* Route - Pickup and Delivery sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pickups */}
            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-secondary/30 rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", theme === "arcade90s" ? "bg-arc-primary" : "bg-emerald-500")} />
                    <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-brand-text")}>
                      Pickups ({pickups.length})
                    </CardTitle>
                  </div>
                  <button
                    type="button"
                    onClick={() => addStop("pickups")}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 text-xs font-medium border rounded transition-colors",
                      theme === "arcade90s"
                        ? "border-arc-primary text-arc-primary hover:bg-arc-primary/10 rounded-none"
                        : "border-emerald-500 text-emerald-400 hover:bg-emerald-500/10"
                    )}
                    data-testid="button-add-pickup"
                  >
                    <Plus className="w-3 h-3" />
                    Add Pickup
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {pickups.map((stop, index) => renderStopCard("pickups", stop, index, pickups.length))}
              </CardContent>
            </Card>

            {/* Deliveries */}
            <Card className={cn(theme === "arcade90s" ? "arcade-panel border-arc-secondary/30 rounded-none" : "bg-brand-card border-brand-border")}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", theme === "arcade90s" ? "bg-arc-secondary" : "bg-brand-gold")} />
                    <CardTitle className={cn("text-sm uppercase tracking-widest", theme === "arcade90s" ? "text-arc-text arcade-pixel-font" : "text-brand-text")}>
                      Deliveries ({deliveries.length})
                    </CardTitle>
                  </div>
                  <button
                    type="button"
                    onClick={() => addStop("deliveries")}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 text-xs font-medium border rounded transition-colors",
                      theme === "arcade90s"
                        ? "border-arc-secondary text-arc-secondary hover:bg-arc-secondary/10 rounded-none"
                        : "border-brand-gold text-brand-gold hover:bg-brand-gold/10"
                    )}
                    data-testid="button-add-delivery"
                  >
                    <Plus className="w-3 h-3" />
                    Add Delivery
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {deliveries.map((stop, index) => renderStopCard("deliveries", stop, index, deliveries.length))}
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
