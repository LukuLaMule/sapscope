import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { fetchClients, fetchSnapshots, fetchMe, fetchHistory } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { buildClientOverview } from "@/lib/data-adapter";
import { getScoreColor, getScoreBorderColor, getScoreBgColor, timeAgo } from "@/lib/sap-utils";
import {
  Building2, Monitor, AlertTriangle, CheckCircle, XCircle,
  ChevronRight, Clock, Zap, ShieldAlert, Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ClientOverview } from "@/types/sap";
import { Sparkline } from "@/components/Sparkline";

export default function OverviewPage() {
  const navigate = useNavigate();
  const [params]  = useSearchParams();
  const [search, setSearch] = useState("");
  const { isAdmin } = useAuth();

  // Redirect to onboarding wizard after Stripe activation
  useEffect(() => {
    if (params.get("activated") === "1") {
      navigate("/onboarding?activated=1", { replace: true });
    }
  }, [params, navigate]);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe, staleTime: Infinity });
  const displayName = me?.email ? me.email.split("@")[0].replace(/[._-]/g, " ") : "";

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn:  fetchClients,
  });

  const snapQueries = useQueries({
    queries: clients.map(c => ({
      queryKey:  ["snapshots", c.id],
      queryFn:   () => fetchSnapshots(c.id),
      enabled:   clients.length > 0,
      staleTime: 30_000,
    })),
  });

  const historyQueries = useQueries({
    queries: clients.map(c => ({
      queryKey:  ["history", c.id],
      queryFn:   () => fetchHistory(c.id, 30),
      enabled:   clients.length > 0,
      staleTime: 300_000, // 5 min — moins volatile que les snapshots
    })),
  });

  const snapsDoneLoading = snapQueries.every(q => !q.isLoading);

  useEffect(() => {
    if (!isAdmin) return;
    if (localStorage.getItem("sapscope_onboarding_done")) return;
    if (isLoading || !snapsDoneLoading) return;
    const hasAnySnapshot = snapQueries.some(q => (q.data?.length ?? 0) > 0);
    if (!hasAnySnapshot) {
      navigate("/onboarding");
    } else {
      localStorage.setItem("sapscope_onboarding_done", "1");
    }
  }, [isAdmin, isLoading, snapsDoneLoading, navigate]);

  const snapUpdatedAt = snapQueries.map(q => q.dataUpdatedAt).join(",");
  const histUpdatedAt = historyQueries.map(q => q.dataUpdatedAt).join(",");

  const clientOverviews: ClientOverview[] = useMemo(() =>
    clients.map((c, i) => buildClientOverview(
      c,
      snapQueries[i]?.data ?? [],
      historyQueries[i]?.data ?? undefined,
    )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clients, snapUpdatedAt, histUpdatedAt]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return clientOverviews;
    const q = search.toLowerCase();
    return clientOverviews.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.systems.some(s => s.sid.toLowerCase().includes(q))
    );
  }, [search, clientOverviews]);

  const totalSystems  = clientOverviews.reduce((s, c) => s + c.systemCount, 0);
  const totalCritical = clientOverviews.reduce((s, c) => s + c.criticalSystems, 0);
  const totalAlerts   = clientOverviews.reduce((s, c) => s + c.totalAlerts, 0);
  const globalAvg     = totalSystems
    ? Math.round(clientOverviews.reduce((s, c) => s + c.avgHealthScore * c.systemCount, 0) / totalSystems)
    : 0;

  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-8">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {greeting}{displayName && <span className="text-primary">, {displayName}</span>}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {clientOverviews.length} client{clientOverviews.length !== 1 ? "s" : ""} · {totalSystems} SAP systems monitored
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search client, SID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-[hsl(var(--surface-1))] border-border h-9 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlobalKPI icon={<Monitor className="w-5 h-5" />} label="Total Systems" value={totalSystems} iconColor="text-primary" />
        <GlobalKPI icon={<Zap className="w-5 h-5" />} label="Global Health" value={globalAvg} suffix="/100" iconColor={getScoreColor(globalAvg)} valueColor={getScoreColor(globalAvg)} />
        <GlobalKPI icon={<XCircle className="w-5 h-5" />} label="Critical Systems" value={totalCritical} iconColor={totalCritical > 0 ? "text-status-critical" : "text-status-ok"} valueColor={totalCritical > 0 ? "text-status-critical" : "text-status-ok"} />
        <GlobalKPI icon={<AlertTriangle className="w-5 h-5" />} label="Active Alerts" value={totalAlerts} iconColor={totalAlerts > 0 ? "text-status-warning" : "text-status-ok"} valueColor={totalAlerts > 0 ? "text-status-warning" : "text-status-ok"} />
      </div>

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your Clients</h2>
        {filtered.length === 0 ? (
          search ? (
            <div className="section-card flex items-center justify-center py-12 text-muted-foreground text-sm">
              {`No clients matching "${search}"`}
            </div>
          ) : (
            <div className="section-card flex flex-col items-center justify-center py-14 gap-6 text-center">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">Welcome to SAPscope</h2>
                <p className="text-sm text-muted-foreground">Follow these steps to start monitoring your SAP landscape.</p>
              </div>
              <ol className="space-y-3 text-left w-full max-w-md">
                {[
                  "An admin creates your SAP client in the Admin panel",
                  "A token is generated and given to you",
                  "Install the agent on your SAP server with the token",
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-mono font-bold text-primary flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-foreground">{text}</span>
                  </li>
                ))}
              </ol>
              <div className="flex gap-3 flex-wrap justify-center">
                {me?.is_admin && (
                  <button
                    onClick={() => navigate("/admin")}
                    className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Go to Admin panel
                  </button>
                )}
                <button
                  onClick={() => navigate("/onboarding")}
                  className="px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-[hsl(var(--surface-1))] transition-colors"
                >
                  View setup guide
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filtered.map(client => (
              <ClientCard key={client.id} client={client} onClick={() => navigate(`/landscape/${client.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GlobalKPI({ icon, label, value, suffix, iconColor, valueColor }: {
  icon: React.ReactNode; label: string; value: number; suffix?: string;
  iconColor?: string; valueColor?: string;
}) {
  return (
    <div className="section-card !p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-[hsl(var(--surface-1))] border border-border ${iconColor || "text-primary"}`}>
        {icon}
      </div>
      <div>
        <div className={`text-2xl font-mono font-bold ${valueColor || "text-foreground"}`}>
          {value}<span className="text-sm font-normal text-muted-foreground">{suffix}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function ClientCard({ client, onClick }: { client: ClientOverview; onClick: () => void }) {
  const isStale = (Date.now() - new Date(client.lastSnapshot).getTime()) > 86400000;
  const trend = client.healthHistory.length >= 2
    ? client.healthHistory[client.healthHistory.length - 1] - client.healthHistory[0]
    : 0;

  return (
    <div onClick={onClick} className="section-card !p-0 overflow-hidden cursor-pointer group hover:border-primary/25 transition-all duration-300">
      <div className="flex items-stretch">
        <div className={`w-1.5 flex-shrink-0 ${
          client.avgHealthScore >= 80 ? "bg-[hsl(var(--status-ok))]"
          : client.avgHealthScore >= 50 ? "bg-[hsl(var(--status-warning))]"
          : "bg-[hsl(var(--status-critical))]"
        }`} />

        <div className="flex-1 p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center font-mono text-xl font-bold transition-transform duration-300 group-hover:scale-105 ${getScoreBorderColor(client.avgHealthScore)} ${getScoreBgColor(client.avgHealthScore)} ${getScoreColor(client.avgHealthScore)}`}>
                {client.avgHealthScore}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">{client.name}</h3>
                  {isStale && (
                    <Badge variant="outline" className="text-[10px] text-[hsl(var(--status-warning))] border-[hsl(var(--status-warning)/0.3)] animate-pulse">
                      <Clock className="w-2.5 h-2.5 mr-1" />STALE
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{client.industry}</span>
                  <span>·</span>
                  <span>{client.systemCount} system{client.systemCount !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>Last snapshot {timeAgo(client.lastSnapshot)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="flex flex-col items-end gap-0.5">
                <Sparkline data={client.healthHistory} width={120} height={32}
                  color={client.avgHealthScore >= 80 ? "ok" : client.avgHealthScore >= 50 ? "warning" : "critical"} />
                <span className={`text-[10px] font-mono ${trend > 0 ? "text-[hsl(var(--status-ok))]" : trend < 0 ? "text-[hsl(var(--status-critical))]" : "text-muted-foreground"}`}>
                  {trend > 0 ? "+" : ""}{trend} pts / 30d
                </span>
              </div>

              <div className="flex items-center gap-5 mr-2">
                <MiniStat icon={<CheckCircle className="w-3.5 h-3.5" />} value={client.okSystems} color="text-[hsl(var(--status-ok))]" label="OK" />
                {client.warningSystems > 0 && <MiniStat icon={<AlertTriangle className="w-3.5 h-3.5" />} value={client.warningSystems} color="text-[hsl(var(--status-warning))]" label="Warn" />}
                {client.criticalSystems > 0 && <MiniStat icon={<XCircle className="w-3.5 h-3.5" />} value={client.criticalSystems} color="text-[hsl(var(--status-critical))]" label="Crit" />}
                {client.totalAlerts > 0 && <MiniStat icon={<ShieldAlert className="w-3.5 h-3.5" />} value={client.totalAlerts} color="text-[hsl(var(--status-warning))]" label="Alerts" />}
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-primary transition-all duration-300 group-hover:translate-x-1" />
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {client.systems.map(sys => <SystemDot key={sys.sid} sys={sys} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon, value, color, label }: { icon: React.ReactNode; value: number; color: string; label: string }) {
  return (
    <div className="text-center">
      <div className={`flex items-center gap-1 ${color}`}>
        {icon}
        <span className="font-mono font-bold text-lg">{value}</span>
      </div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function SystemDot({ sys }: { sys: { sid: string; tier: string; healthScore: number; healthStatus: string } }) {
  const bg = sys.healthScore >= 80 ? "bg-[hsl(var(--status-ok))]"
    : sys.healthScore >= 50 ? "bg-[hsl(var(--status-warning))]"
    : "bg-[hsl(var(--status-critical))]";
  return (
    <div className="group/dot relative">
      <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border border-border/50 bg-[hsl(var(--surface-1))] transition-all duration-200 hover:border-primary/30">
        <div className={`w-2 h-2 rounded-full ${bg}`} />
        <span className="font-mono text-xs font-semibold text-foreground">{sys.sid}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{sys.healthScore}</span>
      </div>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-md bg-popover border border-border text-xs whitespace-nowrap opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
        <span className="font-mono font-semibold text-foreground">{sys.sid}</span>
        <span className="text-muted-foreground"> · {sys.tier} · </span>
        <span className={`font-mono font-bold ${sys.healthStatus === "OK" ? "text-[hsl(var(--status-ok))]" : sys.healthStatus === "WARNING" ? "text-[hsl(var(--status-warning))]" : "text-[hsl(var(--status-critical))]"}`}>
          {sys.healthStatus}
        </span>
      </div>
    </div>
  );
}
