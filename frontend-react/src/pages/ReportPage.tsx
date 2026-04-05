import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { fetchClients, fetchSnapshots, fetchHistory } from "@/lib/api";
import { snapshotToSystem } from "@/lib/data-adapter";
import { getScoreColor, getStatusBadgeClass, getTierBadgeClass, formatDate } from "@/lib/sap-utils";
import { getKernelStatus, getKernelStatusLabel, VERSION_STATUS_CLASS } from "@/lib/sap-versions";
import { Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReportPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const clientInfo = clients.find(c => c.id === clientId);

  const { data: rawSnapshots = [], isLoading } = useQuery({
    queryKey:  ["snapshots", clientId],
    queryFn:   () => fetchSnapshots(clientId!),
    enabled:   !!clientId,
  });

  const { data: history } = useQuery({
    queryKey:  ["history", clientId],
    queryFn:   () => fetchHistory(clientId!, 30),
    enabled:   !!clientId,
    staleTime: 300_000,
  });

  // Latest snapshot per SID
  const systemsBySid = new Map<string, typeof rawSnapshots[0]>();
  for (const s of rawSnapshots) {
    const ex = systemsBySid.get(s.system_sid);
    if (!ex || s.collected_at > ex.collected_at) systemsBySid.set(s.system_sid, s);
  }
  const systems = Array.from(systemsBySid.values())
    .sort((a, b) => (b.health?.score ?? 0) - (a.health?.score ?? 0));

  const totalSystems   = systems.length;
  const okCount        = systems.filter(s => s.health?.status === "OK").length;
  const warnCount      = systems.filter(s => s.health?.status === "WARNING").length;
  const criticalCount  = systems.filter(s => s.health?.status === "CRITICAL").length;
  const avgScore       = totalSystems
    ? Math.round(systems.reduce((s, sys) => s + (sys.health?.score ?? 0), 0) / totalSystems)
    : 0;

  const generatedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  if (isLoading) {
    return <div className="p-10 text-muted-foreground text-sm">Generating report…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden flex items-center gap-3 px-6 py-3 border-b border-border bg-card/50 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <span className="text-sm font-medium text-foreground flex-1">
          Client Report — {clientInfo?.name || clientId}
        </span>
        <Button size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-3.5 h-3.5" />Print / Export PDF
        </Button>
      </div>

      {/* Report content */}
      <div className="max-w-[900px] mx-auto px-8 py-10 space-y-8 report-content">

        {/* Cover */}
        <div className="border-b border-border pb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1 mb-3">
                <span className="font-mono text-lg font-bold text-primary tracking-tight">SAP</span>
                <span className="text-lg font-semibold text-foreground">scope</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground">{clientInfo?.name || "Client Report"}</h1>
              <p className="text-muted-foreground mt-2">SAP Landscape Health Report</p>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground">Generated</div>
              <div className="text-sm font-mono text-foreground">{generatedAt}</div>
              <div className="text-[11px] text-muted-foreground mt-2">Systems</div>
              <div className="text-2xl font-mono font-bold text-foreground">{totalSystems}</div>
            </div>
          </div>
        </div>

        {/* Summary KPIs */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Executive Summary</h2>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Avg Health Score", value: `${avgScore}/100`, color: getScoreColor(avgScore) },
              { label: "Systems OK",       value: String(okCount),       color: "text-[hsl(var(--status-ok))]" },
              { label: "Systems Warning",  value: String(warnCount),     color: warnCount > 0 ? "text-[hsl(var(--status-warning))]" : "text-foreground" },
              { label: "Systems Critical", value: String(criticalCount), color: criticalCount > 0 ? "text-[hsl(var(--status-critical))]" : "text-foreground" },
            ].map(kpi => (
              <div key={kpi.label} className="kpi-card text-center">
                <div className={`text-2xl font-mono font-bold ${kpi.color}`}>{kpi.value}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{kpi.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* System table */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">System Overview</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full table-clean">
              <thead>
                <tr className="border-b border-border">
                  {["SID","Tier","SAP Release","Kernel","BASIS SP","Database","Score","Status","Last Snapshot"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {systems.map(s => {
                  const kStatus = getKernelStatus(s.kernel_release);
                  const kLabel  = getKernelStatusLabel(s.kernel_release);
                  const kernelStr = s.kernel_release
                    ? `${s.kernel_release}${s.kernel_patch ? "."+s.kernel_patch : ""}`
                    : "—";
                  return (
                    <tr key={s.system_sid} className="border-b border-border/50">
                      <td className="px-3 py-2 font-mono font-semibold text-sm text-foreground">{s.system_sid}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${getTierBadgeClass(snapshotToSystem(s, clientId!).tier)}`}>
                          {snapshotToSystem(s, clientId!).tier}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{s.system_release || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-foreground">{kernelStr}</span>
                          {kStatus !== "unknown" && (
                            <span className={`text-[9px] px-1 py-0.5 rounded border font-medium ${VERSION_STATUS_CLASS[kStatus]}`}>{kLabel}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {s.basis_sp ? `SP ${s.basis_sp.padStart(4,"0")}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{s.db_type || "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`font-mono font-bold text-base ${getScoreColor(s.health?.score ?? 0)}`}>
                          {s.health?.score ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getStatusBadgeClass(s.health?.status ?? "UNKNOWN")}`}>
                          {s.health?.status ?? "UNKNOWN"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(s.collected_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-system details — only those with alerts or issues */}
        {systems.filter(s => (s.health?.status ?? "OK") !== "OK").length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Systems Requiring Attention</h2>
            <div className="space-y-4">
              {systems.filter(s => (s.health?.status ?? "OK") !== "OK").map(s => {
                const hc = s.health;
                return (
                  <div key={s.system_sid} className="section-card break-inside-avoid">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`font-mono text-lg font-bold ${getScoreColor(hc?.score ?? 0)}`}>{hc?.score ?? "?"}</span>
                      <span className="font-mono text-base font-semibold text-foreground">{s.system_sid}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusBadgeClass(hc?.status ?? "UNKNOWN")}`}>
                        {hc?.status ?? "UNKNOWN"}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">{s.system_host}</span>
                    </div>
                    {hc?.indicators && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(hc.indicators).map(([domain, ind]: [string, any]) => (
                          ind?.score != null && (
                            <div key={domain} className="kpi-card flex items-center justify-between">
                              <span className="text-xs text-muted-foreground capitalize">{domain.replace(/_/g," ")}</span>
                              <span className={`font-mono text-sm font-bold ${getScoreColor(ind.score)}`}>{ind.score}</span>
                            </div>
                          )
                        ))}
                      </div>
                    )}
                    {s.security_default_users?.length > 0 && (
                      <div className="mt-2 text-xs text-[hsl(var(--status-critical))]">
                        Default users active: {s.security_default_users.join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Component inventory */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Component Inventory</h2>
          <div className="space-y-3">
            {systems.slice(0, 10).map(s => {
              const comps: any[] = s.payload?.components ?? [];
              if (comps.length === 0) return null;
              return (
                <div key={s.system_sid} className="break-inside-avoid">
                  <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-2">
                    <span className="font-mono text-foreground">{s.system_sid}</span>
                    <span>— {comps.length} components</span>
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full table-clean">
                      <thead>
                        <tr>
                          <th>Component</th><th>Release</th><th>SP</th><th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...comps].sort((a,b) => (a.component||"").localeCompare(b.component||"")).slice(0,15).map((c: any) => (
                          <tr key={c.component}>
                            <td className="font-mono font-medium text-foreground">{c.component}</td>
                            <td className="font-mono text-muted-foreground">{c.release}</td>
                            <td className="font-mono text-muted-foreground">{c.extrelease?.replace(/^0+/,"") || "—"}</td>
                            <td className="text-muted-foreground text-xs">{c.description || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border pt-4 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Generated by SAPscope · {generatedAt}</span>
          <span>{clientInfo?.name}</span>
        </div>

      </div>
    </div>
  );
}
