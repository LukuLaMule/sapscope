import { useQuery } from "@tanstack/react-query";
import { BarChart2 } from "lucide-react";
import { fetchBenchmarks } from "@/lib/api";
import type { BenchmarkItem } from "@/lib/api";

interface BenchmarkSectionProps {
  clientId: string;
  sid: string;
}

function statusLabel(status: BenchmarkItem["status"]): string {
  switch (status) {
    case "good":     return "Dans la norme";
    case "warning":  return "Au-dessus";
    case "critical": return "Critique";
    default:         return "Inconnu";
  }
}

function statusTextClass(status: BenchmarkItem["status"]): string {
  switch (status) {
    case "good":     return "text-[hsl(var(--status-ok))]";
    case "warning":  return "text-[hsl(var(--status-warning))]";
    case "critical": return "text-[hsl(var(--status-critical))]";
    default:         return "text-muted-foreground";
  }
}

function statusBadgeClass(status: BenchmarkItem["status"]): string {
  switch (status) {
    case "good":
      return "bg-[hsl(var(--status-ok))]/10 border border-[hsl(var(--status-ok))]/30 text-[hsl(var(--status-ok))]";
    case "warning":
      return "bg-[hsl(var(--status-warning))]/10 border border-[hsl(var(--status-warning))]/30 text-[hsl(var(--status-warning))]";
    case "critical":
      return "bg-[hsl(var(--status-critical))]/10 border border-[hsl(var(--status-critical))]/30 text-[hsl(var(--status-critical))]";
    default:
      return "bg-[hsl(var(--surface-2))] border border-border text-muted-foreground";
  }
}

function BenchmarkBar({ item }: { item: BenchmarkItem }) {
  const sysVal  = item.system_value ?? 0;
  const avg     = item.tier_avg ?? 0;

  // avg is always shown at 50%; system bar scales relative to avg*2
  const maxRef  = avg > 0 ? avg * 2 : Math.max(sysVal * 2, 1);
  const sysPct  = Math.min(100, (sysVal / maxRef) * 100);
  const avgPct  = 50;

  const barColor =
    item.status === "good"     ? "hsl(var(--status-ok))"
    : item.status === "warning"  ? "hsl(var(--status-warning))"
    : item.status === "critical" ? "hsl(var(--status-critical))"
    : "hsl(var(--muted-foreground))";

  return (
    <div className="relative h-4 bg-[hsl(var(--surface-2))] rounded overflow-hidden">
      {/* avg reference line at 50% */}
      <div
        className="absolute top-0 bottom-0 w-px bg-muted-foreground/40"
        style={{ left: `${avgPct}%` }}
        title={`Avg: ${avg}`}
      />
      {/* system value bar */}
      <div
        className="absolute top-0 left-0 h-full rounded transition-all duration-700"
        style={{ width: `${sysPct}%`, backgroundColor: barColor, opacity: 0.75 }}
      />
    </div>
  );
}

export function BenchmarkSection({ clientId, sid }: BenchmarkSectionProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["benchmarks", clientId, sid],
    queryFn:  () => fetchBenchmarks(clientId, sid),
    enabled:  !!(clientId && sid),
    staleTime: 300_000,
  });

  if (isLoading) {
    return (
      <div className="section-card">
        <div className="section-header">
          <div className="section-icon"><BarChart2 className="w-4 h-4" /></div>
          <h3 className="text-sm font-semibold text-foreground">Positionnement vs portefeuille</h3>
        </div>
        <div className="text-sm text-muted-foreground py-4 text-center">Chargement…</div>
      </div>
    );
  }

  if (isError || !data) return null;

  const peerCount = data.items[0]?.peer_count ?? 0;
  const tier      = data.tier;

  return (
    <div className="section-card">
      <div className="section-header">
        <div className="section-icon"><BarChart2 className="w-4 h-4" /></div>
        <h3 className="text-sm font-semibold text-foreground">Positionnement vs portefeuille</h3>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Comparaison avec les systèmes{" "}
        <span className="font-semibold text-foreground">{tier}</span> du portefeuille
        {peerCount > 0 && <> ({peerCount} système{peerCount > 1 ? "s" : ""})</>}
      </p>

      {peerCount < 2 ? (
        <div className="text-sm text-muted-foreground py-2 text-center">
          Pas assez de systèmes {tier} pour calculer un benchmark.
        </div>
      ) : (
        <div className="space-y-4">
          {data.items.map((item) => (
            <div key={item.metric}>
              {/* Label + value row */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <div className="flex items-center gap-2">
                  {item.ratio != null && (
                    <span className={`text-xs font-mono font-semibold ${statusTextClass(item.status)}`}>
                      {item.ratio.toFixed(1)}×
                    </span>
                  )}
                  <span className="text-xs font-mono font-bold text-foreground">
                    {item.system_value ?? "—"}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadgeClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </div>
              </div>

              {/* Comparative bar */}
              <BenchmarkBar item={item} />

              {/* Legend: sys value vs avg */}
              {item.tier_avg != null && (
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-muted-foreground">
                    Moy. {tier} : <span className="font-mono text-foreground">{item.tier_avg.toFixed(1)}</span>
                  </span>
                  {item.tier_median != null && (
                    <span className="text-[10px] text-muted-foreground">
                      Médiane : <span className="font-mono text-foreground">{item.tier_median.toFixed(1)}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
