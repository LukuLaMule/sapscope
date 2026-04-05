import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { fetchClients, fetchSnapshots } from "@/lib/api";
import { snapshotToSystem } from "@/lib/data-adapter";
import { getScoreColor, getTierBadgeClass, getStatusBadgeClass, timeAgo } from "@/lib/sap-utils";
import { getKernelStatus, getKernelStatusLabel, VERSION_STATUS_CLASS } from "@/lib/sap-versions";
import { Download, Search, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SortKey = "client" | "sid" | "tier" | "release" | "kernel" | "sp" | "score" | "status" | "snapshot";
type SortDir = "asc" | "desc";

interface InventoryRow {
  clientId:      string;
  clientName:    string;
  sid:           string;
  tier:          string;
  sapRelease:    string;
  kernelRelease: string | null;
  kernelPatch:   string | null;
  basisSP:       string | null;
  dbType:        string | null;
  score:         number;
  status:        string;
  lastSnapshot:  string;
  snapId:        string;
}

export default function InventoryPage() {
  const navigate = useNavigate();
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [sortKey, setSortKey]         = useState<SortKey>("score");
  const [sortDir, setSortDir]         = useState<SortDir>("asc");

  const { data: clients = [], isLoading: loadingClients } = useQuery({
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

  const rows: InventoryRow[] = useMemo(() => {
    return clients.flatMap((c, i) => {
      const snaps = snapQueries[i]?.data ?? [];
      // Group by SID, take latest snapshot per SID
      const bySid = new Map<string, typeof snaps[0]>();
      for (const s of snaps) {
        const existing = bySid.get(s.system_sid);
        if (!existing || s.collected_at > existing.collected_at) {
          bySid.set(s.system_sid, s);
        }
      }
      return Array.from(bySid.values()).map(s => {
        const sys = snapshotToSystem(s, c.id);
        return {
          clientId:      c.id,
          clientName:    c.name,
          sid:           s.system_sid,
          tier:          sys.tier,
          sapRelease:    s.system_release || "—",
          kernelRelease: s.kernel_release,
          kernelPatch:   s.kernel_patch,
          basisSP:       s.basis_sp,
          dbType:        s.db_type || "—",
          score:         s.health?.score ?? 0,
          status:        s.health?.status ?? "UNKNOWN",
          lastSnapshot:  s.collected_at,
          snapId:        `${c.id}__${s.id}`,
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, snapQueries.map(q => q.dataUpdatedAt).join(",")]);

  const filtered = useMemo(() => {
    let out = rows;
    if (filterStatus !== "all") out = out.filter(r => r.status === filterStatus);
    if (filterClient !== "all") out = out.filter(r => r.clientId === filterClient);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(r =>
        r.sid.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q) ||
        (r.sapRelease || "").toLowerCase().includes(q)
      );
    }
    return [...out].sort((a, b) => {
      let va: string | number = 0, vb: string | number = 0;
      if (sortKey === "client")   { va = a.clientName;    vb = b.clientName; }
      if (sortKey === "sid")      { va = a.sid;            vb = b.sid; }
      if (sortKey === "tier")     { va = a.tier;           vb = b.tier; }
      if (sortKey === "release")  { va = a.sapRelease;     vb = b.sapRelease; }
      if (sortKey === "kernel")   { va = a.kernelRelease || ""; vb = b.kernelRelease || ""; }
      if (sortKey === "sp")       { va = a.basisSP || "";  vb = b.basisSP || ""; }
      if (sortKey === "score")    { va = a.score;          vb = b.score; }
      if (sortKey === "status")   { va = a.status;         vb = b.status; }
      if (sortKey === "snapshot") { va = a.lastSnapshot;   vb = b.lastSnapshot; }
      const cmp = typeof va === "number" ? va - (vb as number) : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, filterStatus, filterClient, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function exportCSV() {
    const header = ["Client","SID","Tier","SAP Release","Kernel","Kernel Status","BASIS SP","Database","Health Score","Status","Last Snapshot"];
    const data = filtered.map(r => [
      r.clientName, r.sid, r.tier, r.sapRelease,
      r.kernelRelease || "—",
      getKernelStatusLabel(r.kernelRelease) || "—",
      r.basisSP ? `SP ${r.basisSP.padStart(4,"0")}` : "—",
      r.dbType || "—",
      r.score, r.status,
      new Date(r.lastSnapshot).toISOString().slice(0,19).replace("T"," "),
    ]);
    const csv = [header, ...data].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `sap-inventory_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isLoading = loadingClients || snapQueries.some(q => q.isLoading);

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  function Th({ label, k }: { label: string; k: SortKey }) {
    return (
      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
        onClick={() => toggleSort(k)}>
        <div className="flex items-center gap-1"><span>{label}</span><SortIcon k={k} /></div>
      </th>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Global Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} system{filtered.length !== 1 ? "s" : ""} across {clients.length} client{clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5" disabled={filtered.length === 0}>
          <Download className="w-3.5 h-3.5" />Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search SID, client, release…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-[hsl(var(--surface-1))] border-border h-9 text-sm" />
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-44 bg-[hsl(var(--surface-1))] border-border h-9 text-sm">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 bg-[hsl(var(--surface-1))] border-border h-9 text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="OK">OK</SelectItem>
            <SelectItem value="WARNING">Warning</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading inventory…</div>
      ) : filtered.length === 0 ? (
        <div className="section-card flex items-center justify-center py-16 text-muted-foreground text-sm">
          {rows.length === 0 ? "No systems found." : "No systems match the current filters."}
        </div>
      ) : (
        <div className="section-card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-clean">
              <thead>
                <tr className="border-b border-border">
                  <Th label="Client"    k="client" />
                  <Th label="SID"       k="sid" />
                  <Th label="Tier"      k="tier" />
                  <Th label="Release"   k="release" />
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Kernel
                  </th>
                  <Th label="BASIS SP"  k="sp" />
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">DB</th>
                  <Th label="Score"     k="score" />
                  <Th label="Status"    k="status" />
                  <Th label="Snapshot"  k="snapshot" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const kernelStr = r.kernelRelease
                    ? `${r.kernelRelease}${r.kernelPatch ? "."+r.kernelPatch : ""}`
                    : "—";
                  const kStatus = getKernelStatus(r.kernelRelease);
                  const kLabel  = getKernelStatusLabel(r.kernelRelease);
                  const spStr   = r.basisSP ? `SP ${r.basisSP.padStart(4,"0")}` : "—";
                  return (
                    <tr key={`${r.clientId}-${r.sid}`}
                      className="border-b border-border/50 hover:bg-[hsl(var(--surface-1))] cursor-pointer transition-colors"
                      onClick={() => navigate(`/system/${r.snapId}`)}>
                      <td className="px-3 py-2.5 text-sm text-muted-foreground">{r.clientName}</td>
                      <td className="px-3 py-2.5 font-mono text-sm font-semibold text-foreground">{r.sid}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTierBadgeClass(r.tier)}`}>
                          {r.tier}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-sm text-muted-foreground">{r.sapRelease}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm text-foreground">{kernelStr}</span>
                          {kStatus !== "unknown" && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${VERSION_STATUS_CLASS[kStatus]}`}>
                              {kLabel}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-sm text-muted-foreground">{spStr}</td>
                      <td className="px-3 py-2.5 text-sm text-muted-foreground">{r.dbType}</td>
                      <td className="px-3 py-2.5">
                        <span className={`font-mono font-bold text-base ${getScoreColor(r.score)}`}>{r.score}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusBadgeClass(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{timeAgo(r.lastSnapshot)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
