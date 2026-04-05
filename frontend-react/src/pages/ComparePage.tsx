import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchClients, fetchSnapshots, fetchSnapshotDetail, type ApiSnapshot, type ApiSnapshotDetail } from "@/lib/api";
import {
  getScoreColor, getScoreBorderColor, getScoreBgColor,
  getStatusBadgeClass, getTierBadgeClass, classifyTier,
} from "@/lib/sap-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Activity, Shield, Database, Layers, Truck, Server, Cpu, Box, ArrowLeftRight } from "lucide-react";

// ── Domain icons ──────────────────────────────────────────────────────────────

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  stability:      <Activity className="w-3.5 h-3.5" />,
  performance:    <Activity className="w-3.5 h-3.5" />,
  security:       <Shield   className="w-3.5 h-3.5" />,
  security_ops:   <Shield   className="w-3.5 h-3.5" />,
  connectivity:   <Layers   className="w-3.5 h-3.5" />,
  infrastructure: <Database className="w-3.5 h-3.5" />,
  transports:     <Truck    className="w-3.5 h-3.5" />,
};

const DOMAIN_ORDER = ["stability","performance","connectivity","infrastructure","security","security_ops","transports"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function latestPerSid(snaps: ApiSnapshot[]): Record<string, ApiSnapshot> {
  const map: Record<string, ApiSnapshot> = {};
  for (const s of snaps) {
    const existing = map[s.system_sid];
    if (!existing || new Date(s.collected_at) > new Date(existing.collected_at)) {
      map[s.system_sid] = s;
    }
  }
  return map;
}

function tierLabel(sid: string, host: string): string {
  const t = classifyTier(sid, host);
  return { pro:"Production", preprod:"Pre-Production", qal:"Quality", dev:"Development", sandbox:"Sandbox", other:"Other" }[t] || "Other";
}

// ── System picker (client → SID) ──────────────────────────────────────────────

interface SysPickerProps {
  label: string;
  selectedClient: string;
  selectedSid: string;
  onClientChange: (v: string) => void;
  onSidChange: (v: string) => void;
  detail?: ApiSnapshotDetail;
}

function SystemPicker({ label, selectedClient, selectedSid, onClientChange, onSidChange, detail }: SysPickerProps) {
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const { data: snaps = [] }   = useQuery({
    queryKey: ["snapshots", selectedClient],
    queryFn:  () => fetchSnapshots(selectedClient),
    enabled:  !!selectedClient,
  });
  const sids = useMemo(() => Object.keys(latestPerSid(snaps)).sort(), [snaps]);

  return (
    <div className="flex-1 space-y-3">
      {/* Label */}
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${label === "A" ? "bg-primary" : "bg-status-ok"}`} />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">System {label}</span>
      </div>

      <div className="flex gap-2">
        <Select value={selectedClient} onValueChange={v => { onClientChange(v); onSidChange(""); }}>
          <SelectTrigger className="flex-1 bg-[hsl(var(--surface-1))] border-border text-sm">
            <SelectValue placeholder="Client…" />
          </SelectTrigger>
          <SelectContent>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={selectedSid} onValueChange={onSidChange} disabled={sids.length === 0}>
          <SelectTrigger className="w-32 bg-[hsl(var(--surface-1))] border-border font-mono text-sm">
            <SelectValue placeholder="SID…" />
          </SelectTrigger>
          <SelectContent>
            {sids.map(sid => <SelectItem key={sid} value={sid} className="font-mono">{sid}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* System header card */}
      {detail ? (
        <SystemHeader snap={detail} accent={label === "A" ? "border-primary/30" : "border-status-ok/30"} />
      ) : (
        <div className="rounded-xl border border-border bg-[hsl(var(--surface-1))] p-4 min-h-[96px] flex items-center justify-center">
          <span className="text-xs text-muted-foreground/40">Select a system</span>
        </div>
      )}
    </div>
  );
}

function SystemHeader({ snap, accent }: { snap: ApiSnapshotDetail; accent: string }) {
  const score  = snap.health?.score ?? 0;
  const status = snap.health?.status ?? "WARNING";
  const tier   = tierLabel(snap.system_sid, snap.system_host);

  return (
    <div className={`rounded-xl border ${accent} bg-[hsl(var(--surface-1))] p-4 flex items-center gap-4`}>
      <div className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center font-mono text-xl font-bold flex-shrink-0
        ${getScoreBorderColor(score)} ${getScoreBgColor(score)} ${getScoreColor(score)}`}>
        {score}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xl font-bold text-foreground">{snap.system_sid}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTierBadgeClass(tier)}`}>{tier}</span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusBadgeClass(status)}`}>{status}</span>
        </div>
        <div className="text-xs text-muted-foreground font-mono mt-1 truncate">{snap.system_host}</div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const [clientA, setClientA] = useState("");
  const [sidA, setSidA]       = useState("");
  const [clientB, setClientB] = useState("");
  const [sidB, setSidB]       = useState("");

  const { data: snapsA = [] } = useQuery({ queryKey: ["snapshots", clientA], queryFn: () => fetchSnapshots(clientA), enabled: !!clientA });
  const { data: snapsB = [] } = useQuery({ queryKey: ["snapshots", clientB], queryFn: () => fetchSnapshots(clientB), enabled: !!clientB });

  const snapIdA = useMemo(() => sidA ? latestPerSid(snapsA)[sidA]?.id : undefined, [snapsA, sidA]);
  const snapIdB = useMemo(() => sidB ? latestPerSid(snapsB)[sidB]?.id : undefined, [snapsB, sidB]);

  const { data: detailA } = useQuery({
    queryKey: ["snap-detail", clientA, snapIdA],
    queryFn:  () => fetchSnapshotDetail(clientA, snapIdA!),
    enabled:  !!(clientA && snapIdA),
  });
  const { data: detailB } = useQuery({
    queryKey: ["snap-detail", clientB, snapIdB],
    queryFn:  () => fetchSnapshotDetail(clientB, snapIdB!),
    enabled:  !!(clientB && snapIdB),
  });

  const ready = !!(detailA && detailB);

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">System Comparison</h1>
        <p className="text-sm text-muted-foreground mt-1">Compare two SAP systems side by side</p>
      </div>

      {/* System selectors */}
      <div className="section-card !p-5">
        <div className="flex items-start gap-4">
          <SystemPicker label="A"
            selectedClient={clientA} selectedSid={sidA}
            onClientChange={setClientA} onSidChange={setSidA}
            detail={detailA} />

          <div className="flex items-center justify-center mt-10 w-10 h-10 rounded-full bg-[hsl(var(--surface-1))] border border-border flex-shrink-0">
            <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
          </div>

          <SystemPicker label="B"
            selectedClient={clientB} selectedSid={sidB}
            onClientChange={setClientB} onSidChange={setSidB}
            detail={detailB} />
        </div>
      </div>

      {!ready && (
        <div className="section-card flex items-center justify-center py-20 text-muted-foreground text-sm">
          Select two systems above to compare them
        </div>
      )}

      {ready && (
        <>
          {/* Health domains */}
          {(detailA.health?.indicators || detailB.health?.indicators) && (
            <CompareSection icon={<Activity className="w-4 h-4" />} title="Health Score Breakdown"
              labelA={detailA.system_sid} labelB={detailB.system_sid}>
              <div className="space-y-2.5">
                {DOMAIN_ORDER.filter(k =>
                  detailA.health?.indicators?.[k] || detailB.health?.indicators?.[k]
                ).map(key => {
                  const dA = detailA.health?.indicators?.[key];
                  const dB = detailB.health?.indicators?.[key];
                  const scoreA = dA?.score ?? 0;
                  const scoreB = dB?.score ?? 0;
                  return (
                    <div key={key} className="rounded-lg bg-[hsl(var(--surface-1))] border border-border/50 p-3.5">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-primary">{DOMAIN_ICONS[key] ?? <Activity className="w-3.5 h-3.5" />}</span>
                        <span className="text-sm font-medium text-foreground flex-1 capitalize">{key.replace(/_/g," ")}</span>
                        <div className="flex items-center gap-3 font-mono text-sm font-bold">
                          <span className={getScoreColor(scoreA)}>{scoreA}</span>
                          <span className="text-muted-foreground/30 text-xs">vs</span>
                          <span className={getScoreColor(scoreB)}>{scoreB}</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <ScoreBar score={scoreA} label={detailA.system_sid} opacity={1} />
                        <ScoreBar score={scoreB} label={detailB.system_sid} opacity={0.6} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CompareSection>
          )}

          {/* Key metrics */}
          <CompareSection icon={<Database className="w-4 h-4" />} title="Key Metrics"
            labelA={detailA.system_sid} labelB={detailB.system_sid}>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full table-clean">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th><span className="text-primary font-mono">{detailA.system_sid}</span></th>
                    <th><span className="text-status-ok font-mono">{detailB.system_sid}</span></th>
                    <th>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <MetricRow label="Health Score"    a={detailA.health?.score ?? 0}       b={detailB.health?.score ?? 0}       unit=""    higherBetter />
                  <MetricRow label="Dialog Response" a={detailA.avg_response_ms ?? 0}     b={detailB.avg_response_ms ?? 0}     unit=" ms" higherBetter={false} />
                  <MetricRow label="SAP_ALL Users"   a={detailA.security_sap_all_count}   b={detailB.security_sap_all_count}   unit=""    higherBetter={false} />
                  <MetricRow label="Transport Queue" a={detailA.transport_queue ?? 0}     b={detailB.transport_queue ?? 0}     unit=""    higherBetter={false} />
                  <MetricRow label="Delayed Jobs"    a={detailA.bg_jobs_delayed ?? 0}     b={detailB.bg_jobs_delayed ?? 0}     unit=""    higherBetter={false} />
                </tbody>
              </table>
            </div>
          </CompareSection>

          {/* System info */}
          <CompareSection icon={<Server className="w-4 h-4" />} title="System Information"
            labelA={detailA.system_sid} labelB={detailB.system_sid}>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full table-clean">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th><span className="text-primary font-mono">{detailA.system_sid}</span></th>
                    <th><span className="text-status-ok font-mono">{detailB.system_sid}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["SAP Release", detailA.system_release ?? "—",       detailB.system_release ?? "—"       ],
                    ["Kernel",      detailA.kernel_release ?? "—",        detailB.kernel_release ?? "—"        ],
                    ["BASIS SP",    detailA.basis_sp ?? "—",              detailB.basis_sp ?? "—"              ],
                    ["Database",    detailA.db_type ?? "—",               detailB.db_type ?? "—"               ],
                    ["Hostname",    detailA.system_host,                  detailB.system_host                  ],
                    ["Tier",        tierLabel(detailA.system_sid, detailA.system_host), tierLabel(detailB.system_sid, detailB.system_host)],
                    ["Unicode",     detailA.unicode === true ? "Yes" : detailA.unicode === false ? "No" : "—", detailB.unicode === true ? "Yes" : detailB.unicode === false ? "No" : "—"],
                  ] as const).map(([label, a, b]) => {
                    const diff = a !== b;
                    return (
                      <tr key={label}>
                        <td className="font-medium text-foreground">{label}</td>
                        <td className={`font-mono ${diff ? "text-foreground" : "text-muted-foreground"}`}>{a}</td>
                        <td className={`font-mono ${diff ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{b}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CompareSection>

          {/* Components */}
          {(detailA.payload?.components?.length > 0 || detailB.payload?.components?.length > 0) && (
            <CompareSection icon={<Layers className="w-4 h-4" />} title="Components"
              labelA={detailA.system_sid} labelB={detailB.system_sid}>
              <ComponentsTable detailA={detailA} detailB={detailB} />
            </CompareSection>
          )}

          {/* Custom objects */}
          {(detailA.payload?.custom_objects?.total > 0 || detailB.payload?.custom_objects?.total > 0) && (
            <CompareSection icon={<Box className="w-4 h-4" />} title="Custom Development"
              labelA={detailA.system_sid} labelB={detailB.system_sid}>
              <div className="grid grid-cols-2 gap-5">
                <CustomObjectGrid snap={detailA} accentColor="text-primary" />
                <CustomObjectGrid snap={detailB} accentColor="text-status-ok" />
              </div>
            </CompareSection>
          )}

          {/* Topology */}
          {(detailA.payload?.instances?.length > 0 || detailB.payload?.instances?.length > 0) && (
            <CompareSection icon={<Server className="w-4 h-4" />} title="System Topology"
              labelA={detailA.system_sid} labelB={detailB.system_sid}>
              <div className="grid grid-cols-2 gap-5">
                <TopologyPanel snap={detailA} accentColor="border-primary/30" />
                <TopologyPanel snap={detailB} accentColor="border-status-ok/30" />
              </div>
            </CompareSection>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CompareSection({ icon, title, labelA, labelB, children }: {
  icon: React.ReactNode; title: string; labelA: string; labelB: string; children: React.ReactNode;
}) {
  return (
    <div className="section-card">
      <div className="section-header mb-4">
        <div className="section-icon">{icon}</div>
        <h3 className="text-sm font-semibold text-foreground flex-1">{title}</h3>
        <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary inline-block" />{labelA}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-status-ok inline-block" />{labelB}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function ScoreBar({ score, label, opacity }: { score: number; label: string; opacity: number }) {
  const color = score >= 80 ? "hsl(var(--status-ok))" : score >= 50 ? "hsl(var(--status-warning))" : "hsl(var(--status-critical))";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[hsl(var(--surface-2))] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color, opacity }} />
      </div>
      <span className={`text-xs font-mono font-bold w-7 flex-shrink-0 ${getScoreColor(score)}`}>{score}</span>
    </div>
  );
}

function MetricRow({ label, a, b, unit, higherBetter }: { label: string; a: number; b: number; unit: string; higherBetter?: boolean }) {
  const delta    = b - a;
  const isBetter = higherBetter === undefined ? null : higherBetter ? delta > 0 : delta < 0;

  return (
    <tr>
      <td className="font-medium text-foreground">{label}</td>
      <td className="font-mono text-muted-foreground">{a}{unit}</td>
      <td className="font-mono text-muted-foreground">{b}{unit}</td>
      <td>
        {delta !== 0 ? (
          <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
            isBetter === true ? "status-badge-ok" : isBetter === false ? "status-badge-critical" : "bg-muted text-muted-foreground"
          }`}>
            {delta > 0 ? "+" : ""}{delta}{unit}
          </span>
        ) : <span className="text-xs text-muted-foreground/40">—</span>}
      </td>
    </tr>
  );
}

function ComponentsTable({ detailA, detailB }: { detailA: ApiSnapshotDetail; detailB: ApiSnapshotDetail }) {
  const compsA: any[] = Array.isArray(detailA.payload?.components) ? detailA.payload.components : [];
  const compsB: any[] = Array.isArray(detailB.payload?.components) ? detailB.payload.components : [];
  const allNames = [...new Set([...compsA.map(c => c.component || c.name), ...compsB.map(c => c.component || c.name)])].sort();

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full table-clean">
        <thead>
          <tr>
            <th>Component</th>
            <th><span className="text-primary font-mono">{detailA.system_sid}</span> Release / SP</th>
            <th><span className="text-status-ok font-mono">{detailB.system_sid}</span> Release / SP</th>
          </tr>
        </thead>
        <tbody>
          {allNames.slice(0, 40).map(name => {
            const cA  = compsA.find(c => (c.component || c.name) === name);
            const cB  = compsB.find(c => (c.component || c.name) === name);
            const spA = cA?.extrelease?.replace(/^0+/, "") || cA?.supportPackage || "—";
            const spB = cB?.extrelease?.replace(/^0+/, "") || cB?.supportPackage || "—";
            const diff = (cA?.release !== cB?.release) || (spA !== spB);
            return (
              <tr key={name}>
                <td className="font-mono font-medium text-foreground">{name}</td>
                <td className={`font-mono ${diff ? "text-foreground" : "text-muted-foreground"}`}>
                  {cA ? `${cA.release} / ${spA}` : <span className="text-muted-foreground/30">—</span>}
                </td>
                <td className={`font-mono ${diff ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                  {cB ? `${cB.release} / ${spB}` : <span className="text-muted-foreground/30">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CustomObjectGrid({ snap, accentColor }: { snap: ApiSnapshotDetail; accentColor: string }) {
  const total   = snap.payload?.custom_objects?.total ?? 0;
  const byType  = snap.payload?.custom_objects?.by_type ?? {};
  return (
    <div>
      <div className={`text-xs font-semibold ${accentColor} mb-2 font-mono`}>
        {snap.system_sid} — {total.toLocaleString()} total
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(byType).sort(([,a],[,b]) => (b as number)-(a as number)).slice(0,8).map(([type, count]) => (
          <div key={type} className="kpi-card text-center">
            <div className="text-xl font-mono font-bold text-foreground">{String(count)}</div>
            <div className="text-[10px] text-muted-foreground">{type}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopologyPanel({ snap, accentColor }: { snap: ApiSnapshotDetail; accentColor: string }) {
  const instances: any[] = Array.isArray(snap.payload?.instances) ? snap.payload.instances : [];
  return (
    <div>
      <div className={`text-xs font-semibold text-muted-foreground mb-2 font-mono`}>{snap.system_sid}</div>
      <div className="space-y-2">
        {instances.map((inst: any, i: number) => (
          <div key={inst.instance_name || inst.hostname || i} className={`kpi-card border ${accentColor}`}>
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <span className="font-mono text-sm font-semibold text-foreground">{inst.hostname}</span>
              <Badge variant="outline" className="text-[10px] font-mono ml-auto">{inst.instance_name}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(inst).filter(([k]) => k.endsWith("_count") && !k.startsWith("instance")).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1 bg-[hsl(var(--surface-2))] rounded px-2 py-0.5">
                  <span className="text-[10px] text-muted-foreground capitalize">{k.replace(/_count$/,"")}</span>
                  <span className="font-mono text-xs font-semibold text-foreground">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {instances.length === 0 && (
          <div className="text-xs text-muted-foreground/40 text-center py-4">No topology data</div>
        )}
      </div>
    </div>
  );
}
