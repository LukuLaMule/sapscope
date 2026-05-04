import { Bell, AlertTriangle, XCircle, CheckCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from "@/lib/api";

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(true),
    refetchInterval: 60_000,
  });

  const unreadCount = notifications.filter((n) => n.read_at === null).length;
  const displayCount = unreadCount > 9 ? "9+" : String(unreadCount);

  async function handleMarkRead(n: NotificationItem) {
    if (!n.read_at) {
      await markNotificationRead(n.id);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
    navigate(`/landscape/${n.client_id}`);
  }

  async function handleMarkAll() {
    await markAllNotificationsRead();
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-8 w-8 p-0 text-muted-foreground">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-semibold text-destructive-foreground leading-none">
              {displayCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[360px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground"
              onClick={handleMarkAll}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No alerts
          </div>
        ) : (
          <ScrollArea className="max-h-[420px]">
            <div className="flex flex-col">
              {notifications.map((n) => {
                const isUnread = n.read_at === null;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleMarkRead(n)}
                    className={[
                      "flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 border-b border-border/50 last:border-0",
                      isUnread ? "bg-muted/40" : "opacity-60",
                    ].join(" ")}
                  >
                    <span className="mt-0.5 shrink-0">
                      {n.severity === "critical" ? (
                        <XCircle className="w-4 h-4 text-destructive" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-[hsl(var(--status-warning))]" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5">
                        {n.client_name}
                      </p>
                      <p className="text-sm leading-snug break-words">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {relativeTime(n.created_at)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
