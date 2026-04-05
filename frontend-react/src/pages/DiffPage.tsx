import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchClients, fetchSnapshots, fetchSnapshotDetail,
  type ApiSnapshot, type ApiSnapshotDetail,
} from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getScoreColor, getStatusBadgeClass, formatDate } from "@/lib/sap-utils";
import {
  ArrowUp, ArrowDown, Equal, CalendarDays, TrendingUp, TrendingDown,
  Shield, Layers, Truck, Cpu, ChevronRight, Monitor,
} from "lucide-react";

type ChangeType = "improved" | "regressed" | "unchanged";

interface DiffField {
  label: string;
  category: string;
  icon: React.ReactNode;
  a: string | number;
  b: string | number;
  change: ChangeType;
  numericDelta?: number;
}

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

  // components from payload
  // components from payload — API uses {component, release, extrelease}
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

export default function DiffPage() {
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

  // auto-select first 2 when SID changes
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
    unchanged: fields.filter(f => f.change === "unchanged").length,
  };

  const scoreA = detailA?.health?.score ?? 0;
  const scoreB = detailB?.health?.score ?? 0;
  const statusA = detailA?.health?.status ?? "—";
  const statusB = detailB?.health?.status ?? "—";

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Snapshot Diff</h1>
        <p className="text-sm text-muted-foreground mt-1">Track what changed between two points in time</p>
      </div>

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
              {/* Summary + filter */}
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
