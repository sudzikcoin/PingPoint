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
import AppAdmin from "@/pages/app-admin";
import AppAdminLogin from "@/pages/app-admin-login";
import AppAdminUserDetail from "@/pages/app-admin-user-detail";
import AppDrivers from "@/pages/app-drivers";
import AppExceptions from "@/pages/app-exceptions";
import AppAnalytics from "@/pages/app-analytics";
import VerifyPage from "@/pages/verify";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import LandingPage from "@/pages/landing";
import { useEffect } from "react";
import { ThemeProvider } from "@/context/theme-context";

function Router() {
  return (
    <Switch>
      {/* Root Landing */}
      <Route path="/" component={LandingPage} />

      {/* Auth */}
      <Route path="/verify" component={VerifyPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />

      {/* Driver Zone */}
      <Route path="/driver" component={DriverDashboard} />
      <Route path="/driver/loads/:id" component={LoadDetails} />
      <Route path="/driver/:token" component={DriverDashboard} />
      
      {/* Broker/Dispatcher Control Zone */}
      <Route path="/app/loads" component={AppLoads} />
      <Route path="/app/loads/new" component={AppLoadNew} />
      <Route path="/app/loads/:id" component={AppLoadDetails} />
      <Route path="/app/exceptions" component={AppExceptions} />
      <Route path="/app/analytics" component={AppAnalytics} />
      <Route path="/app/drivers" component={AppDrivers} />
      <Route path="/app/billing" component={AppBilling} />
      <Route path="/app/settings" component={AppSettings} />
      <Route path="/app/integrations" component={AppIntegrations} />
      <Route path="/app/admin/login" component={AppAdminLogin} />
      <Route path="/app/admin/users/:userId" component={AppAdminUserDetail} />
      <Route path="/app/admin" component={AppAdmin} />

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
