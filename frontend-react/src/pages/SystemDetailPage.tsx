import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchSnapshotDetail, fetchAnalysis, requestAnalysis, fetchSnapshots, fetchHistory, fetchNotes, createNote, updateNote, deleteNote, fetchMe } from "@/lib/api";
import type { ApiSnapshotDetail, ApiAnalysis, ApiNote } from "@/lib/api";
import { DialogResponseChart } from "@/components/charts/DialogResponseChart";
import { WorkProcessChart } from "@/components/charts/WorkProcessChart";
import {
  getStatusBadgeClass, getScoreColor, getScoreBorderColor, getScoreBgColor,
  getTierBadgeClass, formatDate, classifyTier, timeAgo,
} from "@/lib/sap-utils";
import {
  ArrowLeft, Shield, Truck, Clock, Server, Cpu, FileText,
  Activity, Database, Layers, Box, Sparkles, Copy, AlertTriangle, Printer, StickyNote, Pencil, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mdToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hul]|<\/[hul])/gm, "")
    .replace(/^(.+)$/gm, (line) => line.startsWith("<") ? line : `<p>${line}</p>`);
}

// Color a raw indicator value based on its key and magnitude
function indicatorValueColor(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0
      ? "text-[hsl(var(--status-critical))]"
      : "text-[hsl(var(--status-ok))]";
  }
  const num = typeof value === "number" ? value : Number(value);
  if (isNaN(num)) return "text-foreground";

  const errorKeys = ["dumps_7d","jobs_aborted_7d","wp_priv","wp_stopped",
    "trfc_errors","sap_all_count","rfc_no_logon_count","import_queue_count",
    "update_errors","bg_jobs_delayed"];
  if (errorKeys.includes(key)) {
    if (num === 0) return "text-[hsl(var(--status-ok))]";
    if (num <= 2)  return "text-[hsl(var(--status-warning))]";
    return "text-[hsl(var(--status-critical))]";
  }
  if (key === "max_used_pct") {
    if (num >= 90) return "text-[hsl(var(--status-critical))]";
    if (num >= 80) return "text-[hsl(var(--status-warning))]";
    return "text-[hsl(var(--status-ok))]";
  }
  return "text-foreground";
}

// ── Domain config ─────────────────────────────────────────────────────────────

const DOMAINS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "stability",      label: "Stability",      icon: <Activity className="w-4 h-4" /> },
  { key: "performance",    label: "Performance",    icon: <Sparkles className="w-4 h-4" /> },
  { key: "connectivity",   label: "Connectivity",   icon: <Layers className="w-4 h-4" /> },
  { key: "infrastructure", label: "Infrastructure", icon: <Database className="w-4 h-4" /> },
  { key: "security",       label: "Security",       icon: <Shield className="w-4 h-4" /> },
  { key: "security_ops",   label: "Security Ops",   icon: <Shield className="w-4 h-4" /> },
  { key: "transports",     label: "Transports",     icon: <Truck className="w-4 h-4" /> },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SystemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lang, setLang] = useState("English");
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // Decode clientId__snapshotId
  const [clientId, snapId] = (id || "").split("__");

  const { data: snap, isLoading } = useQuery({
    queryKey: ["snapshot-detail", clientId, snapId],
    queryFn:  () => fetchSnapshotDetail(clientId, snapId),
    enabled:  !!(clientId && snapId),
  });

  const { data: analysis, refetch: refetchAnalysis } = useQuery({
    queryKey: ["analysis", clientId, snapId],
    queryFn:  () => fetchAnalysis(clientId, snapId),
    enabled:  !!(clientId && snapId),
  });

  const { mutate: runAnalysis, isPending: analyzing } = useMutation({
    mutationFn: () => requestAnalysis(clientId, snapId, true, lang),
    onSuccess:  () => refetchAnalysis(),
  });

  // All snapshots for this client — used to build response time history
  const { data: allSnapshots = [] } = useQuery({
    queryKey:  ["snapshots", clientId],
    queryFn:   () => fetchSnapshots(clientId),
    enabled:   !!clientId,
    staleTime: 60_000,
  });

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe, staleTime: Infinity });

  const { data: notes = [], refetch: refetchNotes } = useQuery({
    queryKey:  ["notes", clientId, snap?.system_sid],
    queryFn:   () => fetchNotes(clientId, snap!.system_sid),
    enabled:   !!(clientId && snap?.system_sid),
  });

  const { mutate: addNote, isPending: addingNote } = useMutation({
    mutationFn: (content: string) => createNote(clientId, snap!.system_sid, content),
    onSuccess:  () => { setNewNote(""); refetchNotes(); },
  });

  const { mutate: editNote } = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      updateNote(clientId, snap!.system_sid, id, content),
    onSuccess: () => { setEditingNoteId(null); refetchNotes(); },
  });

  const { mutate: removeNote } = useMutation({
    mutationFn: (noteId: string) => deleteNote(clientId, snap!.system_sid, noteId),
    onSuccess: () => refetchNotes(),
  });

  // Health score history for this specific SID
  const { data: history } = useQuery({
    queryKey:  ["history", clientId],
    queryFn:   () => fetchHistory(clientId, 30),
    enabled:   !!clientId,
    staleTime: 300_000,
  });

  // Response time history: snapshots for this SID sorted chronologically
  const responseData = useMemo(() => {
    if (!snap) return [];
    return allSnapshots
      .filter(s => s.system_sid === snap.system_sid && s.avg_response_ms != null)
      .sort((a, b) => new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime())
      .slice(-30)
      .map(s => ({
        date: new Date(s.collected_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        avg:  s.avg_response_ms!,
      }));
  }, [allSnapshots, snap]);

  // Health score history for this SID from /history endpoint
  const scoreHistory = useMemo(() => {
    if (!snap) return [];
    const entries = history?.by_sid?.[snap.system_sid] ?? [];
    return entries.map((e: { date: string; score: number }) => ({
      date: new Date(e.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      avg:  e.score,
    }));
  }, [history, snap]);

  // Work processes per instance from current snapshot
  const wpData = useMemo(() => {
    const instances: any[] = snap?.payload?.instances ?? [];
    return instances
      .filter(inst => inst.dialog_count != null || inst.background_count != null)
      .map(inst => ({
        name:       `${inst.hostname ?? ""} ${inst.instance_name ?? ""}`.trim(),
        dialog:     inst.dialog_count     ?? 0,
        background: inst.background_count ?? 0,
        spool:      inst.spool_count      ?? 0,
        update:     inst.update_count     ?? 0,
      }));
  }, [snap]);

  if (isLoading || !snap) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-muted-foreground text-sm">{isLoading ? "Loading system…" : "System not found."}</div>
      </div>
    );
  }

  const sys    = snap.payload?.system || {};
  const hc     = snap.health;
  const score  = hc?.score ?? 0;
  const status = hc?.status ?? "UNKNOWN";
  const tier   = classifyTier(snap.system_sid, snap.system_host);
  const tierLabel = { pro:"Production", preprod:"Pre-Production", qal:"Quality", dev:"Development", sandbox:"Sandbox", other:"Other" }[tier] || tier;

  const dbType = snap.db_type || sys.rfcdbsys || "—";
  const staleMs = Date.now() - new Date(snap.collected_at).getTime();
  const stale = staleMs > 86_400_000;

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      {/* ─── Header ─── */}
      <div className="section-card !p-0 overflow-hidden">
        <div className="flex items-center gap-5 p-5">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>

          {/* Big score ring */}
          <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center font-mono text-2xl font-bold
            ${getScoreBorderColor(score)} ${getScoreBgColor(score)} ${getScoreColor(score)}`}>
            {score}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-2xl font-bold text-foreground">{snap.system_sid}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getTierBadgeClass(tierLabel)}`}>{tierLabel}</span>
              <span className={`text-xs px-2.5 py-1 rounded font-medium ${getStatusBadgeClass(status)}`}>{status}</span>
              {stale && <Badge variant="outline" className="text-[10px] text-[hsl(var(--status-warning))] border-[hsl(var(--status-warning)/0.3)] animate-pulse">STALE</Badge>}
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
              <span className="font-mono">{snap.system_host}</span>
              {snap.system_release && <><span className="text-border">|</span><span>{snap.system_release}</span></>}
              {dbType !== "—" && <><span className="text-border">|</span><span>{dbType}</span></>}
            </div>
          </div>

          {/* Quick KPIs + Print */}
          <div className="hidden lg:flex items-center gap-3">
            {snap.avg_response_ms != null && <QuickKPI label="Dialog" value={`${snap.avg_response_ms} ms`} warn={snap.avg_response_ms > 600} />}
            <QuickKPI label="Components" value={String(snap.components_count)} />
            <QuickKPI label="Snapshot" value={timeAgo(snap.collected_at)} />
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 ml-2 print:hidden">
              <Printer className="w-3.5 h-3.5" />
              Export PDF
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Main content ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* LEFT — 8 cols */}
        <div className="xl:col-span-8 space-y-5">

          {/* Health domain breakdown */}
          {hc && hc.indicators && Object.keys(hc.indicators).length > 0 && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-icon"><Activity className="w-4 h-4" /></div>
                <h3 className="text-sm font-semibold text-foreground">Health Score Breakdown</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {DOMAINS.filter(d => hc.indicators[d.key]).map(d => {
                  const ind = hc.indicators[d.key];
                  const barColor = ind.score >= 80 ? "hsl(var(--status-ok))"
                    : ind.score >= 50 ? "hsl(var(--status-warning))"
                    : "hsl(var(--status-critical))";
                  const indicators = Object.entries(ind)
                    .filter(([k]) => !["status","score"].includes(k))
                    .slice(0, 3);
                  return (
                    <div key={d.key} className="kpi-card">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-primary">{d.icon}</span>
                        <span className="text-sm font-medium text-foreground flex-1">{d.label}</span>
                        <span className={`font-mono text-base font-bold ${getScoreColor(ind.score)}`}>{ind.score}</span>
                      </div>
                      <div className="score-bar mb-2.5">
                        <div className="score-bar-fill" style={{ width: `${ind.score}%`, backgroundColor: barColor }} />
                      </div>
                      <div className="space-y-1">
                        {indicators.map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground capitalize">{k.replace(/_/g," ")}</span>
                            <span className={`font-mono font-semibold ${indicatorValueColor(k, v)}`}>
                              {Array.isArray(v) ? (v.length > 0 ? v.join(", ") : "None") : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Performance charts */}
          {(scoreHistory.length > 0 || responseData.length > 0 || wpData.length > 0) && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-icon"><Activity className="w-4 h-4" /></div>
                <h3 className="text-sm font-semibold text-foreground">Performance &amp; History</h3>
              </div>
              <div className="space-y-4">
                {scoreHistory.length > 1 && (
                  <HealthScoreChart data={scoreHistory} sid={snap.system_sid} />
                )}
                <div className={`grid gap-4 ${responseData.length > 0 && wpData.length > 0 ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1"}`}>
                  {responseData.length > 0 && <DialogResponseChart data={responseData} />}
                  {wpData.length > 0 && <WorkProcessChart data={wpData} />}
                </div>
              </div>
            </div>
          )}

          {/* System information */}
          <div className="section-card">
            <div className="section-header">
              <div className="section-icon"><Database className="w-4 h-4" /></div>
              <h3 className="text-sm font-semibold text-foreground">System Information</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                ["SAP Release",   snap.system_release || sys.rfcsaprl || "—"],
                ["Kernel",        snap.kernel_release ? `${snap.kernel_release}${snap.kernel_patch ? "."+snap.kernel_patch:""}` : sys.rfckernrl || "—"],
                ["BASIS SP",      snap.basis_sp ? `SP ${snap.basis_sp.padStart(4,"0")}` : "—"],
                ["Database",      dbType],
                ["Unicode",       snap.unicode === true ? "Yes" : snap.unicode === false ? "No" : "—"],
                ["Installation #",snap.installation_no || sys.rfcintno || "—"],
                ["Hostname",      snap.system_host],
                ["Last Snapshot", formatDate(snap.collected_at)],
              ] as const).map(([label, value]) => (
                <div key={label} className="kpi-card">
                  <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
                  <div className="text-sm font-mono text-foreground leading-tight">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom objects */}
          {snap.payload?.custom_objects?.total > 0 && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-icon"><Box className="w-4 h-4" /></div>
                <h3 className="text-sm font-semibold text-foreground">Custom Development</h3>
                <Badge variant="secondary" className="ml-auto text-xs font-mono">{snap.payload.custom_objects.total.toLocaleString()}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(snap.payload.custom_objects.by_type || {})
                  .sort(([,a],[,b]) => (b as number) - (a as number))
                  .slice(0, 8)
                  .map(([type, count]) => (
                    <div key={type} className="kpi-card text-center">
                      <div className="text-2xl font-mono font-bold text-foreground mb-0.5">{String(count)}</div>
                      <div className="text-[11px] text-muted-foreground">{type}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Components */}
          {snap.payload?.components?.length > 0 && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-icon"><Layers className="w-4 h-4" /></div>
                <h3 className="text-sm font-semibold text-foreground">Installed Components</h3>
                <Badge variant="secondary" className="ml-auto text-xs font-mono">{snap.payload.components.length}</Badge>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full table-clean">
                  <thead>
                    <tr>
                      <th>Component</th><th>Release</th><th>SP</th><th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...snap.payload.components]
                      .sort((a,b) => (a.component||"").localeCompare(b.component||""))
                      .slice(0, 30)
                      .map((c: any) => (
                        <tr key={c.component}>
                          <td className="font-mono font-medium text-foreground">{c.component}</td>
                          <td className="font-mono text-muted-foreground">{c.release}</td>
                          <td className="font-mono text-muted-foreground">{c.extrelease?.replace(/^0+/,"") || "—"}</td>
                          <td className="text-muted-foreground">{c.description || "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI Analysis */}
          <div className="section-card" style={{ borderColor: "rgba(56,189,248,0.2)" }}>
            <div className="section-header">
              <div className="section-icon" style={{ background:"rgba(56,189,248,0.12)", color:"#38bdf8" }}>
                <FileText className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold" style={{ color:"#38bdf8" }}>Claude AI Analysis</h3>
                {analysis && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {analysis.model} · {(analysis.input_tokens + analysis.output_tokens).toLocaleString()} tokens · {timeAgo(analysis.created_at)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select value={lang} onChange={e => setLang(e.target.value)}
                  className="bg-[hsl(var(--surface-1))] border border-border rounded-md px-2 py-1 text-sm text-foreground">
                  <option value="English">EN</option>
                  <option value="French">FR</option>
                  <option value="German">DE</option>
                  <option value="Spanish">ES</option>
                </select>
                <Button size="sm" onClick={() => runAnalysis()} disabled={analyzing}>
                  {analyzing ? "Running…" : analysis ? "✦ Re-analyse" : "✦ Analyse"}
                </Button>
              </div>
            </div>

            {analysis ? (
              <div className="prose prose-invert prose-sm max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: mdToHtml(analysis.content) }} />
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Click Analyse to generate an AI-powered report for this system.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — 4 cols */}
        <div className="xl:col-span-4 space-y-5">

          {/* Security */}
          <div className="section-card">
            <div className="section-header">
              <div className="section-icon"><Shield className="w-4 h-4" /></div>
              <h3 className="text-sm font-semibold text-foreground">Security</h3>
            </div>
            {snap.security_default_users.length > 0 && (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Default Users Active</div>
                <div className="space-y-0 mb-3">
                  {snap.security_default_users.map(u => (
                    <div key={u} className="info-row">
                      <span className="font-mono text-foreground">{u}</span>
                      <Badge variant="destructive" className="text-xs">Active</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="info-row">
              <span className="text-muted-foreground">Users with SAP_ALL</span>
              <span className={`font-mono font-bold text-lg ${snap.security_sap_all_count > 0 ? "text-[hsl(var(--status-warning))]" : "text-[hsl(var(--status-ok))]"}`}>
                {snap.security_sap_all_count}
              </span>
            </div>
          </div>

          {/* Transports */}
          {snap.transport_queue != null && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-icon"><Truck className="w-4 h-4" /></div>
                <h3 className="text-sm font-semibold text-foreground">Transports</h3>
              </div>
              <div className="info-row">
                <span className="text-muted-foreground">Queue size</span>
                <span className={`font-mono font-bold text-lg ${(snap.transport_queue || 0) > 50 ? "text-[hsl(var(--status-warning))]" : "text-[hsl(var(--status-ok))]"}`}>
                  {snap.transport_queue}
                </span>
              </div>
              {hc?.indicators?.transports?.recent_imports_count != null && (
                <div className="info-row">
                  <span className="text-muted-foreground">Recent imports (7d)</span>
                  <span className="font-mono font-bold text-lg text-foreground">
                    {hc.indicators.transports.recent_imports_count}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Background Jobs */}
          {snap.bg_jobs_delayed != null && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-icon"><Clock className="w-4 h-4" /></div>
                <h3 className="text-sm font-semibold text-foreground">Background Jobs</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="kpi-card text-center">
                  <div className="text-2xl font-mono font-bold text-foreground">
                    {snap.payload?.background_jobs?.active_count ?? "—"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Active</div>
                </div>
                <div className="kpi-card text-center">
                  <div className={`text-2xl font-mono font-bold ${(snap.bg_jobs_delayed || 0) > 0 ? "text-[hsl(var(--status-warning))]" : "text-[hsl(var(--status-ok))]"}`}>
                    {snap.bg_jobs_delayed}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Delayed</div>
                </div>
              </div>
            </div>
          )}

          {/* Topology */}
          {snap.payload?.instances?.length > 0 && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-icon"><Server className="w-4 h-4" /></div>
                <h3 className="text-sm font-semibold text-foreground">System Topology</h3>
              </div>
              <div className="space-y-3">
                {snap.payload.instances.map((inst: any, i: number) => (
                  <div key={inst.instance_name || inst.hostname || i} className="kpi-card">
                    <div className="flex items-center gap-2 mb-2.5">
                      <Cpu className="w-3.5 h-3.5 text-primary" />
                      <span className="font-mono text-sm font-semibold text-foreground">{inst.hostname}</span>
                      <Badge variant="outline" className="text-[10px] font-mono ml-auto">{inst.instance_name}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(inst).filter(([k]) => k.endsWith("_count") && !k.startsWith("instance")).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-1.5 bg-[hsl(var(--surface-2))] rounded px-2 py-1">
                          <span className="text-[10px] text-muted-foreground capitalize">{k.replace(/_count$/,"")}</span>
                          <span className="font-mono text-xs font-semibold text-foreground">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spool */}
          {snap.spool_pending != null && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-icon"><Box className="w-4 h-4" /></div>
                <h3 className="text-sm font-semibold text-foreground">Spool</h3>
              </div>
              <div className="info-row">
                <span className="text-muted-foreground">Pending requests</span>
                <span className={`font-mono font-bold text-lg ${(snap.spool_pending || 0) > 100 ? "text-[hsl(var(--status-warning))]" : "text-foreground"}`}>
                  {snap.spool_pending}
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="section-card">
            <div className="section-header">
              <div className="section-icon"><StickyNote className="w-4 h-4" /></div>
              <h3 className="text-sm font-semibold text-foreground">Notes</h3>
              {notes.length > 0 && (
                <span className="ml-auto font-mono text-xs text-muted-foreground">{notes.length}</span>
              )}
            </div>

            {notes.length > 0 && (
              <div className="space-y-2.5 mb-3">
                {notes.map((note: ApiNote) => (
                  <div key={note.id} className="kpi-card">
                    {editingNoteId === note.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          className="w-full bg-[hsl(var(--surface-2))] border border-border rounded px-2 py-1.5 text-sm text-foreground resize-none focus:outline-none focus:border-primary/50"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs"
                            onClick={() => editNote({ id: note.id, content: editContent })}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => setEditingNoteId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-foreground whitespace-pre-wrap mb-2 leading-relaxed">{note.content}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">{note.author_email} · {timeAgo(note.created_at)}</span>
                          {(note.author_email === me?.email || me?.is_admin) && (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => { setEditingNoteId(note.id); setEditContent(note.content); }}
                                className="text-muted-foreground hover:text-foreground transition-colors">
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => removeNote(note.id)}
                                className="text-muted-foreground hover:text-[hsl(var(--status-critical))] transition-colors">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Add a note for this system…"
                className="w-full bg-[hsl(var(--surface-1))] border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                rows={2}
              />
              <Button
                size="sm"
                className="w-full h-8"
                disabled={!newNote.trim() || addingNote}
                onClick={() => addNote(newNote.trim())}>
                {addingNote ? "Adding…" : "Add Note"}
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function HealthScoreChart({ data, sid }: { data: { date: string; avg: number }[]; sid: string }) {
  const last = data[data.length - 1]?.avg ?? 0;
  const color = last >= 80 ? "hsl(var(--status-ok))" : last >= 50 ? "hsl(var(--status-warning))" : "hsl(var(--status-critical))";

  return (
    <div className="rounded-lg border border-border bg-[hsl(var(--surface-1))] p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-foreground">Health Score — {sid} (30d)</h4>
        <span className="font-mono text-sm font-bold" style={{ color }}>{last}/100</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gradScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 25%, 15%)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(222, 44%, 8%)", border: "1px solid hsl(222, 25%, 15%)", borderRadius: "8px", fontSize: "12px", color: "hsl(210, 20%, 90%)" }}
            labelStyle={{ color: "hsl(215, 15%, 50%)", marginBottom: 4 }}
            formatter={(v: number) => [`${v}/100`, "Health score"]}
          />
          <Area type="monotone" dataKey="avg" stroke={color} strokeWidth={2} fill="url(#gradScore)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function QuickKPI({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="kpi-card text-center min-w-[80px]">
      <div className={`font-mono text-sm font-bold ${warn ? "text-[hsl(var(--status-warning))]" : "text-foreground"}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
