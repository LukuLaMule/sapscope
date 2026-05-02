import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import LoginPage from "@/pages/LoginPage";
import OverviewPage from "@/pages/OverviewPage";
import LandscapePage from "@/pages/LandscapePage";
import SystemDetailPage from "@/pages/SystemDetailPage";
import DiffPage from "@/pages/DiffPage";
import ComparePage from "@/pages/ComparePage";
import AdminPage from "@/pages/AdminPage";
import OnboardingPage from "@/pages/OnboardingPage";
import InventoryPage from "@/pages/InventoryPage";
import ReportPage from "@/pages/ReportPage";
import SettingsPage from "@/pages/SettingsPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AppRoutes() {
  const { token } = useAuth();

  if (!token) return (
    <Routes>
      <Route path="/app" element={<ResetPasswordPage />} />
      <Route path="*"    element={<LoginPage />} />
    </Routes>
  );

  return (
    <Routes>
      {/* Pages pleine largeur sans AppLayout */}
      <Route path="/onboarding"          element={<OnboardingPage />} />
      <Route path="/report/:clientId"    element={<ReportPage />} />

      <Route path="/*" element={
        <AppLayout>
          <AppErrorBoundary>
          <Routes>
            <Route path="/"                    element={<OverviewPage />} />
            <Route path="/landscape/:clientId" element={<LandscapePage />} />
            <Route path="/system/:id"          element={<SystemDetailPage />} />
            <Route path="/compare"             element={<ComparePage />} />
            <Route path="/diff"                element={<DiffPage />} />
            <Route path="/inventory"             element={<InventoryPage />} />
            <Route path="/settings"            element={<SettingsPage />} />
            <Route path="/admin"               element={<AdminPage />} />
            <Route path="*"                    element={<NotFound />} />
          </Routes>
          </AppErrorBoundary>
        </AppLayout>
      } />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
