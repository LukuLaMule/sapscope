import { Home, GitCompare, Settings, Columns2, Table2, SlidersHorizontal, BadgeCheck, ShieldCheck } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import type { LicenseStatus } from "@/lib/api";

const baseItems = [
  { title: "Overview",  url: "/",          icon: Home             },
  { title: "Inventory", url: "/inventory", icon: Table2           },
  { title: "Compare",   url: "/compare",   icon: Columns2         },
  { title: "Diff",      url: "/diff",      icon: GitCompare       },
  { title: "Settings",  url: "/settings",  icon: SlidersHorizontal },
];

const adminItem = { title: "Admin", url: "/admin", icon: ShieldCheck };

const TIER_LABEL: Record<string, string> = {
  solo:       "Solo",
  team:       "Team",
  enterprise: "Enterprise",
  trial:      "Trial",
};

interface Props {
  license?: LicenseStatus;
}

export function AppSidebar({ license }: Props) {
  const { state } = useSidebar();
  const { isAdmin } = useAuth();
  const collapsed = state === "collapsed";
  const items = isAdmin ? [...baseItems, adminItem] : baseItems;

  const showBadge = license?.configured && license.valid && license.plan;
  const tierLabel = license?.plan ? (TIER_LABEL[license.plan] ?? license.plan) : null;
  const isExpiringSoon = (license?.days_remaining ?? 999) <= 30;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === "/"} className="hover:bg-accent/50" activeClassName="bg-accent text-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {showBadge && (
        <SidebarFooter className="border-t border-border pt-3 pb-3">
          <div className={`flex items-center gap-2 px-3 ${collapsed ? "justify-center" : ""}`}>
            <BadgeCheck className={`w-4 h-4 shrink-0 ${isExpiringSoon ? "text-[hsl(var(--status-warning))]" : "text-[hsl(var(--status-ok))]"}`} />
            {!collapsed && (
              <div className="min-w-0">
                <div className={`text-xs font-semibold ${isExpiringSoon ? "text-[hsl(var(--status-warning))]" : "text-[hsl(var(--status-ok))]"}`}>
                  {tierLabel}
                </div>
                {license?.expires_at && (
                  <div className="text-[10px] text-muted-foreground truncate">
                    {isExpiringSoon
                      ? `Expires in ${license.days_remaining}d`
                      : `Until ${new Date(license.expires_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}`
                    }
                  </div>
                )}
              </div>
            )}
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
