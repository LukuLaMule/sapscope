import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, RefreshCw } from "lucide-react";
import { fetchAgentLogs, type AgentLog } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Props {
  clientId: string;
}

const LEVEL_STYLES: Record<string, string> = {
  ERROR:   "text-[hsl(var(--status-critical))] bg-[hsl(var(--status-critical))]/10 border-[hsl(var(--status-critical))]/30",
  WARNING: "text-[hsl(var(--status-warning))] bg-[hsl(var(--status-warning))]/10 border-[hsl(var(--status-warning))]/30",
  INFO:    "text-[hsl(var(--status-ok))] bg-[hsl(var(--status-ok))]/10 border-[hsl(var(--status-ok))]/30",
  DEBUG:   "text-muted-foreground bg-[hsl(var(--surface-2))] border-border",
};

const LEVELS = ["", "ERROR", "WARNING", "INFO"] as const;

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function AgentLogsPanel({ clientId }: Props) {
  const [level, setLevel] = useState("");
  const [sid,   setSid]   = useState("");

  const { data: logs = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey:  ["agent-logs", clientId, level, sid],
    queryFn:   () => fetchAgentLogs(clientId, { level: level || undefined, sid: sid || undefined, limit: 200 }),
    staleTime: 60_000,
  });

  const sids = [...new Set(logs.map((l) => l.system_sid).filter(Boolean))].sort() as string[];

  return (
    <div className="section-card">
      <div className="section-header">
        <div className="section-icon"><ScrollText className="w-4 h-4" /></div>
        <h3 className="text-sm font-semibold text-foreground">Logs agent</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {dataUpdatedAt ? `Mis à jour ${fmt(new Date(dataUpdatedAt).toISOString())}` : ""}
        </span>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 ml-2" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <select
          value={level}
          onChange={e => setLevel(e.target.value)}
          className="text-xs bg-[hsl(var(--surface-1))] border border-border rounded px-2 py-1 text-foreground"
        >
          <option value="">Tous les niveaux</option>
          {LEVELS.filter(Boolean).map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        <select
          value={sid}
          onChange={e => setSid(e.target.value)}
          className="text-xs bg-[hsl(var(--surface-1))] border border-border rounded px-2 py-1 text-foreground"
        >
          <option value="">Tous les SIDs</option>
          {sids.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Chargement…</div>
      ) : logs.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">
          Aucun log disponible — les logs apparaissent après la prochaine collecte.
        </div>
      ) : (
        <div className="overflow-auto max-h-96 rounded border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[hsl(var(--surface-2))] border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium w-36">Horodatage</th>
                <th className="text-left px-2 py-2 text-muted-foreground font-medium w-16">SID</th>
                <th className="text-left px-2 py-2 text-muted-foreground font-medium w-20">Niveau</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border/50 hover:bg-[hsl(var(--surface-1))]">
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {fmt(log.created_at)}
                  </td>
                  <td className="px-2 py-1.5 font-mono font-semibold text-foreground">
                    {log.system_sid ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${LEVEL_STYLES[log.level] ?? LEVEL_STYLES.DEBUG}`}>
                      {log.level}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-foreground font-mono break-all">
                    {log.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
