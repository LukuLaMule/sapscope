import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchClients, fetchSnapshots, fetchSnapshotDetail, fetchLatestSnapshots, fetchCrossSystemDiff,
  type ApiSnapshot, type ApiSnapshotDetail, type ApiLatestSnapshot, type ApiCrossSystemDiff,
} from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getScoreColor, getStatusBadgeClass, formatDate } from "@/lib/sap-utils";
import {
  ArrowUp, ArrowDown, Equal, CalendarDays, TrendingUp,
  Shield, Layers, Truck, Cpu, ChevronRight, Monitor, GitCompare, ArrowLeftRight,
  Plus, Minus, RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChangeType = "improved" | "regressed" | "unchanged";
type DiffMode = "snapshot" | "cross";

interface DiffField {
  label: string;
  category: string;
  icon: React.ReactNode;
  a: string | number;
  b: string | number;
  change: ChangeType;
  numericDelta?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isImprovement(label: string, a: string | number, b: string | number): boolean {
  if (label === "Health Score") return Number(b) > Number(a);
  if (label === "SAP_ALL Users" || label === "Transport Queue" || label === "Delayed Jobs") return Number(b) < Number(a);
  if (label === "Health Status" || label === "Security Status") {
    const order = { OK: 0, WARNING: 1, CRITICAL: 2 };
    return (order[b as keyof typeof order] ?? 0) < (order[a as keyof typeof order] ?? 0);
  }
  return String(b) > String(a);
}

function snapToFields(a: ApiSnapshotDetail, b: ApiSnapshotDetail): DiffField[] {
  const kernA = a.kernel_release ? `${a.kernel_release}${a.kernel_patch ? " P" + a.kernel_patch : ""}` : "—";
  const kernB = b.kernel_release ? `${b.kernel_release}${b.kernel_patch ? " P" + b.kernel_patch : ""}` : "—";
  const spA   = a.basis_sp ? `SP${a.basis_sp.padStart(4, "0")}` : "—";
  const spB   = b.basis_sp ? `SP${b.basis_sp.padStart(4, "0")}` : "—";

  const raw: Omit<DiffField, "change" | "numericDelta">[] = [
    { label: "Health Score",    category: "Health",     icon: <TrendingUp className="w-3.5 h-3.5" />, a: a.health?.score ?? 0,  b: b.health?.score ?? 0  },
    { label: "Health Status",   category: "Health",     icon: <TrendingUp className="w-3.5 h-3.5" />, a: a.health?.status ?? "—", b: b.health?.status ?? "—" },
    { label: "Security Status", category: "Security",   icon: <Shield className="w-3.5 h-3.5" />,     a: a.security_critical ? "CRITICAL" : "OK", b: b.security_critical ? "CRITICAL" : "OK" },
    { label: "SAP_ALL Users",   category: "Security",   icon: <Shield className="w-3.5 h-3.5" />,     a: a.security_sap_all_count, b: b.security_sap_all_count },
    { label: "Transport Queue", category: "Operations", icon: <Truck className="w-3.5 h-3.5" />,      a: a.transport_queue ?? 0,   b: b.transport_queue ?? 0   },
    { label: "Delayed Jobs",    category: "Operations", icon: <Truck className="w-3.5 h-3.5" />,      a: a.bg_jobs_delayed ?? 0,   b: b.bg_jobs_delayed ?? 0   },
    { label: "Kernel Version",  category: "System",     icon: <Cpu className="w-3.5 h-3.5" />,        a: kernA, b: kernB },
    { label: "BASIS SP",        category: "System",     icon: <Layers className="w-3.5 h-3.5" />,     a: spA,   b: spB   },
  ];

  const compsA: any[] = Array.isArray(a.payload?.components) ? a.payload.components : [];
  const compsB: any[] = Array.isArray(b.payload?.components) ? b.payload.components : [];
  const getName = (c: any) => c.component || c.name || "";
  const getVer  = (c: any) => {
    const sp = (c.extrelease || "").replace(/^0+/, "") || c.supportPackage || "";
    return c.release ? `${c.release}${sp ? " SP" + sp : ""}` : (c.version || "—");
  };
  const allNames = [...new Set([...compsA.map(getName), ...compsB.map(getName)])].filter(Boolean);
  allNames.forEach(name => {
    const cA = compsA.find(c => getName(c) === name);
    const cB = compsB.find(c => getName(c) === name);
    raw.push({
      label: name, category: "Components", icon: <Layers className="w-3.5 h-3.5" />,
      a: cA ? getVer(cA) : "—",
      b: cB ? getVer(cB) : "—",
    });
  });

  return raw.map(f => {
    const changed = String(f.a) !== String(f.b);
    const numA = Number(f.a), numB = Number(f.b);
    return {
      ...f,
      change:       changed ? (isImprovement(f.label, f.a, f.b) ? "improved" : "regressed") : "unchanged",
      numericDelta: (!isNaN(numA) && !isNaN(numB) && changed) ? numB - numA : undefined,
    };
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DiffPage() {
  const [mode, setMode] = useState<DiffMode>("snapshot");

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      {/* Header + mode tabs */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Snapshot Diff</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "snapshot"
              ? "Track what changed between two points in time"
              : "Compare components and packages across two different SAP systems"}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-[hsl(var(--surface-1))] border border-border rounded-lg p-1">
          <button
            onClick={() => setMode("snapshot")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              mode === "snapshot"
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Same System
          </button>
          <button
            onClick={() => setMode("cross")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              mode === "cross"
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Cross-System
          </button>
        </div>
      </div>

      {mode === "snapshot" ? <SnapshotDiff /> : <CrossSystemDiff />}
    </div>
  );
}

// ── Snapshot diff (same system, two points in time) ───────────────────────────

function SnapshotDiff() {
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedSid, setSelectedSid]       = useState("");
  const [snapAId, setSnapAId]               = useState("");
  const [snapBId, setSnapBId]               = useState("");
  const [filter, setFilter]                 = useState<"all" | "changed" | "improved" | "regressed">("all");

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });

  const { data: snapshots = [] } = useQuery({
    queryKey: ["snapshots", selectedClient],
    queryFn:  () => fetchSnapshots(selectedClient),
    enabled:  !!selectedClient,
  });

  const sids = useMemo(() => [...new Set(snapshots.map(s => s.system_sid))].sort(), [snapshots]);

  const sidSnaps: ApiSnapshot[] = useMemo(
    () => snapshots.filter(s => s.system_sid === selectedSid).sort((a, b) =>
      new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()
    ),
    [snapshots, selectedSid]
  );

  const effectiveA = snapAId || sidSnaps[1]?.id || sidSnaps[0]?.id || "";
  const effectiveB = snapBId || sidSnaps[0]?.id || "";

  const { data: detailA } = useQuery({
    queryKey: ["snap-detail", selectedClient, effectiveA],
    queryFn:  () => fetchSnapshotDetail(selectedClient, effectiveA),
    enabled:  !!selectedClient && !!effectiveA,
  });
  const { data: detailB } = useQuery({
    queryKey: ["snap-detail", selectedClient, effectiveB],
    queryFn:  () => fetchSnapshotDetail(selectedClient, effectiveB),
    enabled:  !!selectedClient && !!effectiveB,
  });

  const fields = useMemo<DiffField[]>(() => {
    if (!detailA || !detailB) return [];
    return snapToFields(detailA, detailB);
  }, [detailA, detailB]);

  const filtered = fields.filter(f => {
    if (filter === "all") return true;
    if (filter === "changed") return f.change !== "unchanged";
    return f.change === filter;
  });

  const categories = [...new Set(filtered.map(f => f.category))];
  const stats = {
    improved:  fields.filter(f => f.change === "improved").length,
    regressed: fields.filter(f => f.change === "regressed").length,
  };

  const scoreA = detailA?.health?.score ?? 0;
  const scoreB = detailB?.health?.score ?? 0;
  const statusA = detailA?.health?.status ?? "—";
  const statusB = detailB?.health?.status ?? "—";

  return (
    <div className="space-y-6">
      {/* Client + SID selectors */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</span>
          <Select value={selectedClient} onValueChange={v => { setSelectedClient(v); setSelectedSid(""); setSnapAId(""); setSnapBId(""); }}>
            <SelectTrigger className="w-56 bg-[hsl(var(--surface-1))] border-border">
              <SelectValue placeholder="Select client…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {selectedClient && sids.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System</span>
            <Select value={selectedSid} onValueChange={v => { setSelectedSid(v); setSnapAId(""); setSnapBId(""); }}>
              <SelectTrigger className="w-40 bg-[hsl(var(--surface-1))] border-border font-mono">
                <Monitor className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Select SID…" />
              </SelectTrigger>
              <SelectContent>
                {sids.map(sid => <SelectItem key={sid} value={sid} className="font-mono">{sid}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!selectedClient && (
        <div className="section-card flex items-center justify-center py-16 text-muted-foreground text-sm">
          Select a client to compare snapshots
        </div>
      )}
      {selectedClient && !selectedSid && sids.length > 0 && (
        <div className="section-card flex items-center justify-center py-16 text-muted-foreground text-sm">
          Select a system to compare
        </div>
      )}
      {selectedSid && sidSnaps.length < 2 && (
        <div className="section-card flex items-center justify-center py-12 text-muted-foreground text-sm">
          At least 2 snapshots required for a diff
        </div>
      )}

      {selectedSid && sidSnaps.length >= 2 && (
        <>
          {/* Timeline selector */}
          <div className="section-card !p-0 overflow-hidden">
            <div className="flex items-stretch">
              <div className="flex-1 p-4 border-r border-border">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Before</span>
                  {!snapAId && <span className="text-[10px] text-muted-foreground/60 border border-border px-1.5 py-0.5 rounded ml-auto">auto</span>}
                </div>
                <Select value={effectiveA} onValueChange={setSnapAId}>
                  <SelectTrigger className="bg-[hsl(var(--surface-1))] border-border font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sidSnaps.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-mono">{formatDate(s.collected_at)}</span>
                        {s.health && <span className="text-muted-foreground ml-2">— {s.health.score}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-3 mt-3">
                  <div className={`font-mono text-2xl font-bold ${getScoreColor(scoreA)}`}>{scoreA}</div>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusBadgeClass(statusA)}`}>{statusA}</span>
                </div>
              </div>

              <div className="flex items-center justify-center w-16 bg-[hsl(var(--surface-1))]/50">
                <div className="flex flex-col items-center gap-1">
                  <ChevronRight className="w-5 h-5 text-primary" />
                  <span className="text-[9px] font-mono text-muted-foreground">DIFF</span>
                </div>
              </div>

              <div className="flex-1 p-4 border-l border-border">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">After</span>
                  {!snapBId && <span className="text-[10px] text-muted-foreground/60 border border-border px-1.5 py-0.5 rounded ml-auto">auto</span>}
                </div>
                <Select value={effectiveB} onValueChange={setSnapBId}>
                  <SelectTrigger className="bg-[hsl(var(--surface-1))] border-border font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sidSnaps.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-mono">{formatDate(s.collected_at)}</span>
                        {s.health && <span className="text-muted-foreground ml-2">— {s.health.score}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-3 mt-3">
                  <div className={`font-mono text-2xl font-bold ${getScoreColor(scoreB)}`}>{scoreB}</div>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusBadgeClass(statusB)}`}>{statusB}</span>
                  {scoreA !== scoreB && (
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${scoreB > scoreA ? "status-badge-ok" : "status-badge-critical"}`}>
                      {scoreB > scoreA ? "+" : ""}{scoreB - scoreA}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {fields.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <FilterPill active={filter === "all"} onClick={() => setFilter("all")} count={fields.length} label="All" />
                <FilterPill active={filter === "changed"} onClick={() => setFilter("changed")} count={stats.improved + stats.regressed} label="Changed" color="text-primary" />
                <FilterPill active={filter === "improved"} onClick={() => setFilter("improved")} count={stats.improved} label="Improved" color="text-[hsl(var(--status-ok))]" icon={<ArrowUp className="w-3 h-3" />} />
                <FilterPill active={filter === "regressed"} onClick={() => setFilter("regressed")} count={stats.regressed} label="Regressed" color="text-[hsl(var(--status-critical))]" icon={<ArrowDown className="w-3 h-3" />} />
              </div>
              <div className="space-y-5">
                {categories.map(cat => {
                  const catFields = filtered.filter(f => f.category === cat);
                  if (!catFields.length) return null;
                  return (
                    <div key={cat}>
                      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{cat}</div>
                      <div className="space-y-2">
                        {catFields.map(f => <DiffRow key={f.label} field={f} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {fields.length === 0 && effectiveA && effectiveB && (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              Loading snapshot details…
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Cross-system diff ─────────────────────────────────────────────────────────

interface SnapEntry {
  snap: ApiLatestSnapshot;
  label: string;  // "ClientName — SID"
}

function CrossSystemDiff() {
  const [snapAKey, setSnapAKey] = useState("");  // "{client_id}|{snap_id}"
  const [snapBKey, setSnapBKey] = useState("");

  const { data: latest = [], isLoading } = useQuery({
    queryKey: ["snapshots-latest"],
    queryFn:  () => fetchLatestSnapshots(100),
  });

  const entries: SnapEntry[] = useMemo(
    () => latest.map(s => ({
      snap: s,
      label: `${s.client_name} — ${s.system_sid}`,
    })),
    [latest]
  );

  const snapA = useMemo(() => latest.find(s => `${s.client_id}|${s.id}` === snapAKey), [latest, snapAKey]);
  const snapB = useMemo(() => latest.find(s => `${s.client_id}|${s.id}` === snapBKey), [latest, snapBKey]);

  const diffEnabled = !!(snapA && snapB && snapAKey !== snapBKey);

  const { data: diff, isLoading: diffLoading, error: diffError } = useQuery({
    queryKey: ["cross-diff", snapAKey, snapBKey],
    queryFn:  () => fetchCrossSystemDiff(
      snapA!.client_id, snapA!.id,
      snapB!.id, snapB!.client_id,
    ),
    enabled: diffEnabled,
  });

  if (isLoading) {
    return (
      <div className="section-card flex items-center justify-center py-16 text-muted-foreground text-sm">
        Loading systems…
      </div>
    );
  }

  if (latest.length === 0) {
    return (
      <div className="section-card flex items-center justify-center py-16 text-muted-foreground text-sm">
        No snapshots available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System selectors */}
      <div className="section-card !p-0 overflow-hidden">
        <div className="flex items-stretch">
          {/* System A */}
          <div className="flex-1 p-4 border-r border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">System A</span>
            </div>
            <Select value={snapAKey} onValueChange={setSnapAKey}>
              <SelectTrigger className="bg-[hsl(var(--surface-1))] border-border font-mono">
                <SelectValue placeholder="Select system A…" />
              </SelectTrigger>
              <SelectContent>
                {entries.map(e => (
                  <SelectItem
                    key={`${e.snap.client_id}|${e.snap.id}`}
                    value={`${e.snap.client_id}|${e.snap.id}`}
                  >
                    <span className="font-mono font-semibold">{e.snap.system_sid}</span>
                    <span className="text-muted-foreground text-xs ml-2">{e.snap.client_name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {snapA && (
              <div className="flex items-center gap-3 mt-3">
                <div className={`font-mono text-2xl font-bold ${getScoreColor(snapA.health?.score ?? 0)}`}>
                  {snapA.health?.score ?? "—"}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusBadgeClass(snapA.health?.status ?? "—")}`}>
                  {snapA.health?.status ?? "—"}
                </span>
                <span className="text-xs text-muted-foreground font-mono ml-auto">{formatDate(snapA.collected_at)}</span>
              </div>
            )}
          </div>

          {/* VS divider */}
          <div className="flex items-center justify-center w-16 bg-[hsl(var(--surface-1))]/50 flex-shrink-0">
            <div className="flex flex-col items-center gap-1">
              <GitCompare className="w-5 h-5 text-primary" />
              <span className="text-[9px] font-mono text-muted-foreground">VS</span>
            </div>
          </div>

          {/* System B */}
          <div className="flex-1 p-4 border-l border-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--status-ok))]" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">System B</span>
            </div>
            <Select value={snapBKey} onValueChange={setSnapBKey}>
              <SelectTrigger className="bg-[hsl(var(--surface-1))] border-border font-mono">
                <SelectValue placeholder="Select system B…" />
              </SelectTrigger>
              <SelectContent>
                {entries.map(e => (
                  <SelectItem
                    key={`${e.snap.client_id}|${e.snap.id}`}
                    value={`${e.snap.client_id}|${e.snap.id}`}
                  >
                    <span className="font-mono font-semibold">{e.snap.system_sid}</span>
                    <span className="text-muted-foreground text-xs ml-2">{e.snap.client_name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {snapB && (
              <div className="flex items-center gap-3 mt-3">
                <div className={`font-mono text-2xl font-bold ${getScoreColor(snapB.health?.score ?? 0)}`}>
                  {snapB.health?.score ?? "—"}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusBadgeClass(snapB.health?.status ?? "—")}`}>
                  {snapB.health?.status ?? "—"}
                </span>
                <span className="text-xs text-muted-foreground font-mono ml-auto">{formatDate(snapB.collected_at)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Placeholder states */}
      {!snapA && !snapB && (
        <div className="section-card flex items-center justify-center py-16 text-muted-foreground text-sm">
          Select two systems above to compare their technical stacks
        </div>
      )}
      {(snapA || snapB) && !diffEnabled && (
        <div className="section-card flex items-center justify-center py-10 text-muted-foreground text-sm">
          Select a second system to run the diff
        </div>
      )}

      {/* Loading */}
      {diffLoading && diffEnabled && (
        <div className="section-card flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Computing cross-system diff…
        </div>
      )}

      {/* Error */}
      {diffError && (
        <div className="section-card flex items-center justify-center py-10 text-[hsl(var(--status-critical))] text-sm">
          {String((diffError as Error).message)}
        </div>
      )}

      {/* Results */}
      {diff && snapA && snapB && (
        <CrossSystemDiffResults diff={diff} sidA={snapA.system_sid} sidB={snapB.system_sid} />
      )}
    </div>
  );
}

// ── Cross-system diff results ─────────────────────────────────────────────────

function CrossSystemDiffResults({ diff, sidA, sidB }: { diff: ApiCrossSystemDiff; sidA: string; sidB: string }) {
  const { system_changes, components, support_packages, custom_objects } = diff;

  const totalChanges =
    system_changes.length +
    components.added.length + components.removed.length + components.changed.length +
    support_packages.added.length + support_packages.removed.length + support_packages.changed.length;

  return (
    <div className="space-y-5">
      {/* Cross-system badge + summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className="bg-primary/15 text-primary border border-primary/30 text-xs font-mono px-3 py-1">
          {sidA} vs {sidB}
        </Badge>
        <Badge variant="outline" className="text-xs font-medium">
          {totalChanges} difference{totalChanges !== 1 ? "s" : ""} found
        </Badge>
        {totalChanges === 0 && (
          <Badge variant="outline" className="text-xs font-medium border-[hsl(var(--status-ok))]/30 text-[hsl(var(--status-ok))]">
            Systems are identical
          </Badge>
        )}
      </div>

      {/* System-level fields */}
      {system_changes.length > 0 && (
        <CrossSection title="System Parameters" icon={<Monitor className="w-4 h-4" />} sidA={sidA} sidB={sidB}>
          <div className="space-y-2">
            {system_changes.map(ch => (
              <div key={ch.field} className="rounded-lg border border-border/50 bg-card/30 p-3.5 flex items-center gap-4">
                <div className="w-7 h-7 rounded-md flex items-center justify-center bg-[hsl(var(--status-warning))]/15 text-[hsl(var(--status-warning))] flex-shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-[160px]">
                  <span className="text-sm font-medium text-foreground">{ch.label}</span>
                </div>
                <div className="flex-1 flex items-center gap-3 font-mono text-sm">
                  <span className="px-2.5 py-1 rounded bg-[hsl(var(--surface-1))] text-primary">{ch.old || "—"}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
                  <span className="px-2.5 py-1 rounded bg-[hsl(var(--surface-1))] text-[hsl(var(--status-ok))]">{ch.new || "—"}</span>
                </div>
              </div>
            ))}
          </div>
        </CrossSection>
      )}

      {/* Components */}
      {(components.added.length + components.removed.length + components.changed.length) > 0 && (
        <CrossSection title="Components" icon={<Layers className="w-4 h-4" />} sidA={sidA} sidB={sidB}>
          <ComponentsDiffTable added={components.added} removed={components.removed} changed={components.changed} sidA={sidA} sidB={sidB} />
        </CrossSection>
      )}

      {/* Support packages */}
      {(support_packages.added.length + support_packages.removed.length + support_packages.changed.length) > 0 && (
        <CrossSection title="Support Packages" icon={<Cpu className="w-4 h-4" />} sidA={sidA} sidB={sidB}>
          <SpDiffTable added={support_packages.added} removed={support_packages.removed} changed={support_packages.changed} sidA={sidA} sidB={sidB} />
        </CrossSection>
      )}

      {/* Custom objects */}
      {(custom_objects.total_delta !== 0 || Object.keys(custom_objects.by_type_delta).length > 0) && (
        <CrossSection title="Custom Development" icon={<Shield className="w-4 h-4" />} sidA={sidA} sidB={sidB}>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--surface-1))] border border-border/50">
              <span className="text-sm font-medium text-foreground flex-1">Total custom objects delta</span>
              <DeltaBadge delta={custom_objects.total_delta} />
            </div>
            {Object.entries(custom_objects.by_type_delta)
              .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
              .map(([type, delta]) => (
                <div key={type} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/30">
                  <span className="text-sm text-muted-foreground font-mono flex-1">{type}</span>
                  <DeltaBadge delta={delta} />
                </div>
              ))}
          </div>
        </CrossSection>
      )}

      {totalChanges === 0 && (
        <div className="section-card flex items-center justify-center py-12 text-muted-foreground text-sm">
          No technical differences detected between {sidA} and {sidB}
        </div>
      )}
    </div>
  );
}

function CrossSection({ title, icon, sidA, sidB, children }: {
  title: string; icon: React.ReactNode; sidA: string; sidB: string; children: React.ReactNode;
}) {
  return (
    <div className="section-card">
      <div className="section-header mb-4">
        <div className="section-icon">{icon}</div>
        <h3 className="text-sm font-semibold text-foreground flex-1">{title}</h3>
        <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary inline-block" />{sidA}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[hsl(var(--status-ok))] inline-block" />{sidB}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${delta > 0 ? "status-badge-ok" : "status-badge-critical"}`}>
      {delta > 0 ? "+" : ""}{delta}
    </span>
  );
}

function ComponentsDiffTable({ added, removed, changed, sidA, sidB }: {
  added: any[]; removed: any[]; changed: any[]; sidA: string; sidB: string;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full table-clean">
        <thead>
          <tr>
            <th>Component</th>
            <th>Status</th>
            <th><span className="text-primary font-mono">{sidA}</span></th>
            <th><span className="text-[hsl(var(--status-ok))] font-mono">{sidB}</span></th>
          </tr>
        </thead>
        <tbody>
          {added.map((c: any) => (
            <tr key={`add-${c.component}`}>
              <td className="font-mono font-medium">{c.component}</td>
              <td><span className="flex items-center gap-1 text-[hsl(var(--status-ok))] text-xs"><Plus className="w-3 h-3" />Only in {sidB}</span></td>
              <td className="text-muted-foreground/30 font-mono">—</td>
              <td className="font-mono text-[hsl(var(--status-ok))]">{c.release} / {(c.extrelease || "").replace(/^0+/, "") || "—"}</td>
            </tr>
          ))}
          {removed.map((c: any) => (
            <tr key={`rem-${c.component}`}>
              <td className="font-mono font-medium">{c.component}</td>
              <td><span className="flex items-center gap-1 text-primary text-xs"><Minus className="w-3 h-3" />Only in {sidA}</span></td>
              <td className="font-mono text-primary">{c.release} / {(c.extrelease || "").replace(/^0+/, "") || "—"}</td>
              <td className="text-muted-foreground/30 font-mono">—</td>
            </tr>
          ))}
          {changed.map((c: any) => (
            <tr key={`chg-${c.component}`}>
              <td className="font-mono font-medium">{c.component}</td>
              <td><span className="flex items-center gap-1 text-[hsl(var(--status-warning))] text-xs"><RefreshCw className="w-3 h-3" />Different</span></td>
              <td className="font-mono text-primary">{c.release?.old} / {(c.extrelease?.old || "").replace(/^0+/, "") || "—"}</td>
              <td className="font-mono text-[hsl(var(--status-ok))]">{c.release?.new} / {(c.extrelease?.new || "").replace(/^0+/, "") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpDiffTable({ added, removed, changed, sidA, sidB }: {
  added: any[]; removed: any[]; changed: any[]; sidA: string; sidB: string;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full table-clean">
        <thead>
          <tr>
            <th>Component</th>
            <th>Status</th>
            <th><span className="text-primary font-mono">{sidA}</span> Patch</th>
            <th><span className="text-[hsl(var(--status-ok))] font-mono">{sidB}</span> Patch</th>
          </tr>
        </thead>
        <tbody>
          {added.map((s: any) => (
            <tr key={`add-${s.component}`}>
              <td className="font-mono font-medium">{s.component}</td>
              <td><span className="flex items-center gap-1 text-[hsl(var(--status-ok))] text-xs"><Plus className="w-3 h-3" />Only in {sidB}</span></td>
              <td className="text-muted-foreground/30 font-mono">—</td>
              <td className="font-mono text-[hsl(var(--status-ok))]">{s.patch}</td>
            </tr>
          ))}
          {removed.map((s: any) => (
            <tr key={`rem-${s.component}`}>
              <td className="font-mono font-medium">{s.component}</td>
              <td><span className="flex items-center gap-1 text-primary text-xs"><Minus className="w-3 h-3" />Only in {sidA}</span></td>
              <td className="font-mono text-primary">{s.patch}</td>
              <td className="text-muted-foreground/30 font-mono">—</td>
            </tr>
          ))}
          {changed.map((s: any) => (
            <tr key={`chg-${s.component}`}>
              <td className="font-mono font-medium">{s.component}</td>
              <td><span className="flex items-center gap-1 text-[hsl(var(--status-warning))] text-xs"><RefreshCw className="w-3 h-3" />Different</span></td>
              <td className="font-mono text-primary">{s.patch?.old}</td>
              <td className="font-mono text-[hsl(var(--status-ok))]">{s.patch?.new}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function FilterPill({ active, onClick, count, label, color, icon }: {
  active: boolean; onClick: () => void; count: number; label: string; color?: string; icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
        active
          ? "bg-primary/15 text-primary border border-primary/30"
          : "bg-[hsl(var(--surface-1))] text-muted-foreground border border-border hover:border-primary/20"
      }`}
    >
      {icon}
      {label}
      <span className={`font-mono font-bold ${active ? "" : color || ""}`}>{count}</span>
    </button>
  );
}

function DiffRow({ field }: { field: DiffField }) {
  const { label, icon, a, b, change, numericDelta } = field;
  const changed = change !== "unchanged";

  return (
    <div className={`rounded-lg border p-3.5 flex items-center gap-4 transition-all duration-200 ${
      changed
        ? change === "improved"
          ? "border-[hsl(var(--status-ok))]/20 bg-[hsl(var(--status-ok))]/[0.03] hover:bg-[hsl(var(--status-ok))]/[0.06]"
          : "border-[hsl(var(--status-critical))]/20 bg-[hsl(var(--status-critical))]/[0.03] hover:bg-[hsl(var(--status-critical))]/[0.06]"
        : "border-border/50 bg-card/30 opacity-50 hover:opacity-70"
    }`}>
      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
        changed
          ? change === "improved" ? "bg-[hsl(var(--status-ok))]/15 text-[hsl(var(--status-ok))]" : "bg-[hsl(var(--status-critical))]/15 text-[hsl(var(--status-critical))]"
          : "bg-muted text-muted-foreground"
      }`}>
        {changed ? (change === "improved" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />) : <Equal className="w-3.5 h-3.5" />}
      </div>

      <div className="flex items-center gap-2 min-w-[140px]">
        <span className="text-muted-foreground">{icon}</span>
        <span className={`text-sm font-medium ${changed ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
      </div>

      <div className="flex-1 flex items-center gap-3">
        <div className={`font-mono text-sm px-2.5 py-1 rounded ${changed ? "bg-[hsl(var(--surface-1))] text-muted-foreground line-through decoration-muted-foreground/30" : "text-muted-foreground/50"}`}>
          {String(a)}
        </div>
        {changed && <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />}
        <div className={`font-mono text-sm px-2.5 py-1 rounded font-semibold ${
          changed
            ? change === "improved"
              ? "bg-[hsl(var(--status-ok))]/10 text-[hsl(var(--status-ok))]"
              : "bg-[hsl(var(--status-critical))]/10 text-[hsl(var(--status-critical))]"
            : "text-muted-foreground/50"
        }`}>
          {String(b)}
        </div>
      </div>

      <div className="flex-shrink-0 w-20 text-right">
        {numericDelta !== undefined ? (
          <span className={`inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded ${
            change === "improved" ? "status-badge-ok" : "status-badge-critical"
          }`}>
            {numericDelta > 0 ? "+" : ""}{numericDelta}
          </span>
        ) : changed ? (
          <Badge variant="outline" className={`text-[10px] font-medium ${
            change === "improved" ? "border-[hsl(var(--status-ok))]/30 text-[hsl(var(--status-ok))]" : "border-[hsl(var(--status-critical))]/30 text-[hsl(var(--status-critical))]"
          }`}>
            {change === "improved" ? "Upgraded" : "Downgraded"}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
