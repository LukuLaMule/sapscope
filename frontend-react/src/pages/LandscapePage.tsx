import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { SAPSystem, Tier } from "@/types/sap";
import { fetchClients, fetchSnapshots } from "@/lib/api";
import { snapshotToSystem } from "@/lib/data-adapter";
import { SystemCard } from "@/components/SystemCard";
import { LandscapeSchema } from "@/components/LandscapeSchema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Monitor, AlertTriangle, CheckCircle, LayoutGrid, Network, ArrowLeft, Download, FileText } from "lucide-react";

const tiers: Tier[] = ["Production", "Pre-Production", "Quality", "Development", "Sandbox"];

export default function LandscapePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [selectedClient, setSelectedClient] = useState(clientId || "");

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn:  fetchClients,
  });

  const { data: rawSnapshots = [], isLoading } = useQuery({
    queryKey: ["snapshots", selectedClient],
    queryFn:  () => fetchSnapshots(selectedClient),
    enabled:  !!selectedClient,
  });

  const clientSystems: SAPSystem[] = rawSnapshots.map(s => snapshotToSystem(s, selectedClient));
  const clientInfo = clients.find(c => c.id === selectedClient);

  const groupedSystems = tiers.reduce((acc, tier) => {
    acc[tier] = clientSystems.filter(s => s.tier === tier);
    return acc;
  }, {} as Record<Tier, SAPSystem[]>);

  const totalAlerts  = clientSystems.reduce((s, sys) => s + sys.alerts.length, 0);
  const criticalCount = clientSystems.filter(s => s.healthStatus === "CRITICAL").length;
  const okCount       = clientSystems.filter(s => s.healthStatus === "OK").length;

  function exportCSV() {
    const header = ["SID","Tier","Type","Status","Health Score","SAP Release","Kernel","BASIS SP","Database","Dialog (ms)","Alerts","Last Snapshot"];
    const rows = clientSystems.map(s => [
      s.sid, s.tier, s.systemType ?? "", s.healthStatus, s.healthScore,
      s.sapRelease, s.kernelVersion, s.basisSP, s.dbType,
      s.avgDialogResponse, s.alerts.length,
      new Date(s.lastSnapshot).toISOString().slice(0, 19).replace("T", " "),
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `${clientInfo?.name ?? "landscape"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Tabs defaultValue="schema" className="flex flex-col h-[calc(100vh-48px)]">

      {/* ── Barre top : header + résumé ───────────────────────── */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-border/50 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                {clientInfo?.name || "System Landscape"}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {clientSystems.length} system{clientSystems.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {clients.length > 1 && (
            <Select value={selectedClient} onValueChange={v => { setSelectedClient(v); navigate(`/landscape/${v}`); }}>
              <SelectTrigger className="w-64 bg-[hsl(var(--surface-1))] border-border">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-3 flex-wrap">
            <SummaryPill icon={<Monitor className="w-4 h-4 text-primary" />} label="Systems" value={clientSystems.length} />
            <SummaryPill icon={<CheckCircle className="w-4 h-4 text-[hsl(var(--status-ok))]" />} label="Healthy" value={okCount} color="text-[hsl(var(--status-ok))]" />
            {criticalCount > 0 && <SummaryPill icon={<AlertTriangle className="w-4 h-4 text-[hsl(var(--status-critical))]" />} label="Critical" value={criticalCount} color="text-[hsl(var(--status-critical))]" />}
            {totalAlerts > 0 && <SummaryPill icon={<AlertTriangle className="w-4 h-4 text-[hsl(var(--status-warning))]" />} label="Alerts" value={totalAlerts} color="text-[hsl(var(--status-warning))]" />}
          </div>

          <div className="flex items-center gap-2">
            {clientSystems.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 h-9">
                  <Download className="w-3.5 h-3.5" />Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate(`/report/${selectedClient}`)} className="gap-1.5 h-9">
                  <FileText className="w-3.5 h-3.5" />Report PDF
                </Button>
              </>
            )}
            <TabsList className="bg-[hsl(var(--surface-1))] border border-border" id="landscape-tabs-list">
              <TabsTrigger value="schema" className="gap-1.5"><Network className="w-3.5 h-3.5" />Schema</TabsTrigger>
              <TabsTrigger value="cards"  className="gap-1.5"><LayoutGrid className="w-3.5 h-3.5" />Cards</TabsTrigger>
            </TabsList>
          </div>
        </div>
      </div>

      {/* ── Contenu ───────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading systems…</div>
      ) : !selectedClient ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a client to view its landscape.
        </div>
      ) : clientSystems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No snapshots yet for this client.
        </div>
      ) : (
        <>
          <TabsContent value="schema" className="flex-1 min-h-0 m-0 data-[state=active]:flex data-[state=active]:flex-col">
            <LandscapeSchema systems={clientSystems} />
          </TabsContent>

          <TabsContent value="cards" className="flex-1 overflow-auto px-6 py-5 m-0">
            <div className="space-y-6">
              {tiers.map(tier => {
                const tierSystems = groupedSystems[tier];
                if (!tierSystems.length) return null;
                return (
                  <div key={tier}>
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{tier}</h2>
                      <Badge variant="secondary" className="text-xs font-mono">{tierSystems.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {tierSystems.map(system => (
                        <SystemCard key={system.id} system={system} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}

function SummaryPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[hsl(var(--surface-1))] border border-border px-4 py-2.5">
      {icon}
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${color || "text-foreground"}`}>{value}</span>
    </div>
  );
}
