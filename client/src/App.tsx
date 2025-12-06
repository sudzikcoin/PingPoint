import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import DriverDashboard from "@/pages/driver-dashboard";
import LoadDetails from "@/pages/load-details";
import PublicTracking from "@/pages/public-tracking";
import AppLoads from "@/pages/app-loads";
import AppLoadNew from "@/pages/app-load-new";
import AppLoadDetails from "@/pages/app-load-details";
import AppBilling from "@/pages/app-billing";
import AppSettings from "@/pages/app-settings";
import AppIntegrations from "@/pages/app-integrations";
import VerifyPage from "@/pages/verify";
import LandingPage from "@/pages/landing";
import { useEffect } from "react";
import { ThemeProvider } from "@/context/theme-context";

function Router() {
  return (
    <Switch>
      {/* Root Landing */}
      <Route path="/" component={LandingPage} />

      {/* Verification */}
      <Route path="/verify" component={VerifyPage} />

      {/* Driver Zone */}
      <Route path="/driver" component={DriverDashboard} />
      <Route path="/driver/loads/:id" component={LoadDetails} />
      <Route path="/driver/:token" component={DriverDashboard} />
      
      {/* Broker/Dispatcher Control Zone */}
      <Route path="/app/loads" component={AppLoads} />
      <Route path="/app/loads/new" component={AppLoadNew} />
      <Route path="/app/loads/:id" component={AppLoadDetails} />
      <Route path="/app/billing" component={AppBilling} />
      <Route path="/app/settings" component={AppSettings} />
      <Route path="/app/integrations" component={AppIntegrations} />

      {/* Public Tracking */}
      <Route path="/public/track/:token" component={PublicTracking} />
      <Route path="/track/:token" component={PublicTracking} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
