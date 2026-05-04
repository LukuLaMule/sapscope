import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { fetchTrends, type TrendItem } from "@/lib/api";

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 60, h = 24;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="opacity-70 flex-shrink-0">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// ── Trend arrow ───────────────────────────────────────────────────────────────

function TrendArrow({ item }: { item: TrendItem }) {
  if (item.trend === "up" && (item.status === "warning" || item.status === "critical")) {
    return <span className="text-[hsl(var(--status-critical))] text-base leading-none">↑</span>;
  }
  if (item.trend === "down") {
    return <span className="text-[hsl(var(--status-ok))] text-base leading-none">↓</span>;
  }
  return <span className="text-muted-foreground text-base leading-none">→</span>;
}

// ── Threshold badge ───────────────────────────────────────────────────────────

function ThresholdBadge({ item }: { item: TrendItem }) {
  if (item.days_to_threshold == null) return null;
  const days = Math.round(item.days_to_threshold);
  if (item.status === "critical") {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[hsl(var(--status-critical))]/10 border border-[hsl(var(--status-critical))]/30 text-[hsl(var(--status-critical))] whitespace-nowrap">
        CRITIQUE dans {days}j
      </span>
    );
  }
  if (item.status === "warning") {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[hsl(var(--status-warning))]/10 border border-[hsl(var(--status-warning))]/30 text-[hsl(var(--status-warning))] whitespace-nowrap">
        ATTENTION dans {days}j
      </span>
    );
  }
  return null;
}

// ── Row background ────────────────────────────────────────────────────────────

function rowBg(status: TrendItem["status"]): string {
  if (status === "critical") return "bg-[hsl(var(--status-critical))]/10 border border-[hsl(var(--status-critical))]/20";
  if (status === "warning")  return "bg-[hsl(var(--status-warning))]/10 border border-[hsl(var(--status-warning))]/20";
  return "bg-[hsl(var(--surface-1))] border border-border/60";
}

// ── TrendSection ──────────────────────────────────────────────────────────────

interface Props {
  clientId: string;
  sid: string;
}

export function TrendSection({ clientId, sid }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["trends", clientId, sid],
    queryFn:  () => fetchTrends(clientId, sid),
    enabled:  !!(clientId && sid),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="section-card">
        <div className="section-header">
          <div className="section-icon"><TrendingUp className="w-4 h-4" /></div>
          <h3 className="text-sm font-semibold text-foreground">Tendances &amp; prédictions</h3>
        </div>
        <div className="text-sm text-muted-foreground py-4 text-center">Chargement des tendances…</div>
      </div>
    );
  }

  if (isError || !data) return null;

  return (
    <div className="section-card">
      <div className="section-header">
        <div className="section-icon"><TrendingUp className="w-4 h-4" /></div>
        <h3 className="text-sm font-semibold text-foreground">Tendances &amp; prédictions</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Basé sur {data.snapshot_count} snapshots
        </span>
      </div>

      {data.snapshot_count < 3 ? (
        <div className="text-sm text-muted-foreground py-3 text-center">
          Pas assez d'historique pour calculer des tendances (minimum 3 collectes).
        </div>
      ) : data.items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-3 text-center">
          Aucune tendance disponible pour ce système.
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map((item) => (
            <div
              key={item.metric}
              className={`rounded-lg px-3 py-2 ${rowBg(item.status)}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-muted-foreground flex-shrink-0">
                  <Sparkline values={item.values} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground">{item.label}</span>
                </div>
                <span className="font-mono text-sm font-semibold text-foreground tabular-nums flex-shrink-0">
                  {item.current_value != null ? item.current_value : "—"}
                </span>
                <TrendArrow item={item} />
              </div>
              {item.days_to_threshold != null && (
                <div className="mt-1 pl-1">
                  <ThresholdBadge item={item} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
