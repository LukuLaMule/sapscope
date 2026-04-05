import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border bg-card/50 px-2 gap-2">
            <SidebarTrigger className="ml-1" />
            <div className="ml-2 flex items-center gap-1">
              <span className="font-mono text-sm font-bold text-primary tracking-tight">SAP</span>
              <span className="text-sm font-semibold text-foreground">scope</span>
            </div>
            <div className="flex-1" />
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
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
