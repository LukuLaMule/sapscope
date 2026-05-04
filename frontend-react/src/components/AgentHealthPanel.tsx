import { useQuery } from "@tanstack/react-query";
import { fetchAgentHealth, type ApiAgentHealth } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

function formatAge(minutes: number | null): string {
  if (minutes === null) return "inconnu";
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rem = Math.round(minutes % 60);
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}min`;
}

function statusColor(status: ApiAgentHealth["status"]): string {
  switch (status) {
    case "ok":      return "bg-emerald-500";
    case "warning": return "bg-amber-500";
    case "down":    return "bg-red-500";
  }
}

function badgeVariant(status: ApiAgentHealth["status"]): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ok":      return "secondary";
    case "warning": return "outline";
    case "down":    return "destructive";
  }
}

export default function AgentHealthPanel() {
  const { data: agents = [], isLoading, error } = useQuery({
    queryKey: ["agent-health"],
    queryFn: fetchAgentHealth,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
        Chargement…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-10 text-destructive text-sm">
        Erreur lors du chargement des agents
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
        Aucun agent enregistré
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {agents.map(agent => (
        <div
          key={agent.client_id}
          className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border"
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor(agent.status)}`} />

          <div className="flex-1 min-w-0">
            <span className="font-mono text-sm font-semibold text-foreground">
              {agent.client_id}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              vu il y a {formatAge(agent.age_minutes)}
              {" · "}
              {agent.monitored_sids.length} SID{agent.monitored_sids.length !== 1 ? "s" : ""}
              {agent.agent_version ? ` · v${agent.agent_version}` : ""}
            </span>
            {agent.monitored_sids.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {agent.monitored_sids.map(sid => (
                  <span
                    key={sid}
                    className="text-[10px] font-mono bg-[hsl(var(--surface-2))] border border-border rounded px-1.5 py-px text-muted-foreground"
                  >
                    {sid}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {agent.status === "down" && (
              <AlertTriangle className="w-4 h-4 text-destructive" />
            )}
            <Badge variant={badgeVariant(agent.status)} className="text-xs capitalize">
              {agent.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
