import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, AlertTriangle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchLicenseStatus } from "@/lib/api";
import { TrialBanner } from "@/components/TrialBanner";
import { NotificationBell } from "@/components/NotificationBell";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const { data: license } = useQuery({
    queryKey: ["license-status"],
    queryFn:  fetchLicenseStatus,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const showExpiring = license?.configured && license.valid && (license.days_remaining ?? 999) <= 30;
  const showInvalid  = license?.configured && !license.valid;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar license={license} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border bg-card/50 px-2 gap-2">
            <SidebarTrigger className="ml-1" />
            <div className="ml-2 flex items-center gap-1">
              <span className="font-mono text-sm font-bold text-primary tracking-tight">SAP</span>
              <span className="text-sm font-semibold text-foreground">scope</span>
            </div>
            <div className="flex-1" />
            <NotificationBell />
            {isAdmin && (
              <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground h-8"
                onClick={() => navigate("/admin")}>
                <Shield className="w-3.5 h-3.5" />Admin
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground h-8 hover:text-destructive" onClick={logout}>
              <LogOut className="w-3.5 h-3.5" />Logout
            </Button>
          </header>

          <TrialBanner />

          {showInvalid && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[hsl(var(--status-critical))]/10 border-b border-[hsl(var(--status-critical))]/30 text-[hsl(var(--status-critical))] text-xs">
              <XCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium">
                {license?.reason === "expired"
                  ? "License expired — renew at sapscope.fr"
                  : "Invalid license key — contact support@sapscope.fr"}
              </span>
              {license?.grace_mode && (
                <span className="ml-2 text-muted-foreground">(grace period active)</span>
              )}
            </div>
          )}

          {showExpiring && !showInvalid && (
            <div className="flex items-center gap-2 px-4 py-2 bg-[hsl(var(--status-warning))]/10 border-b border-[hsl(var(--status-warning))]/30 text-[hsl(var(--status-warning))] text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                License expires in <strong>{license.days_remaining} day{license.days_remaining === 1 ? "" : "s"}</strong> — renew at sapscope.fr
              </span>
            </div>
          )}

          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
