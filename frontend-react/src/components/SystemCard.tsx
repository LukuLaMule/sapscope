import { useNavigate } from "react-router-dom";
import type { SAPSystem } from "@/types/sap";
import {
  getStatusBadgeClass, getScoreColor, getScoreBorderColor, getScoreBgColor,
  getTierBadgeClass, timeAgo,
} from "@/lib/sap-utils";
import { getKernelStatus, getKernelStatusLabel, VERSION_STATUS_CLASS } from "@/lib/sap-versions";
import { AlertTriangle, Clock, Activity } from "lucide-react";

interface Props {
  system: SAPSystem;
}

export function SystemCard({ system }: Props) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/system/${system.id}`)}
      className="rounded-lg border border-border bg-card p-4 card-hover group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`score-ring border-2 ${getScoreBorderColor(system.healthScore)} ${getScoreBgColor(system.healthScore)} ${getScoreColor(system.healthScore)}`}>
            {system.healthScore}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-semibold text-foreground">{system.sid}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTierBadgeClass(system.tier)}`}>
                {system.tier}
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{system.hostname}</span>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded font-medium ${getStatusBadgeClass(system.healthStatus)}`}>
          {system.healthStatus}
        </span>
      </div>

      {/* Tech info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
        <span>{system.sapRelease}</span>
        <span className="flex items-center gap-1">
          Kernel {system.kernelVersion}
          {(() => {
            const kStatus = getKernelStatus(system.kernelVersion);
            const kLabel  = getKernelStatusLabel(system.kernelVersion);
            if (kStatus === "ok" || kStatus === "unknown") return null;
            return (
              <span className={`text-[9px] px-1 py-0 rounded border font-medium leading-4 ${VERSION_STATUS_CLASS[kStatus]}`}>
                {kLabel}
              </span>
            );
          })()}
        </span>
        <span>BASIS {system.basisSP}</span>
        <span>{system.dbType}</span>
      </div>

      {/* Response time */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
        <Activity className="w-3 h-3" />
        <span>Avg dialog: <span className={`font-mono font-medium ${system.avgDialogResponse > 1000 ? "text-status-critical" : system.avgDialogResponse > 600 ? "text-status-warning" : "text-foreground"}`}>{system.avgDialogResponse} ms</span></span>
      </div>

      {/* Alerts */}
      {system.alerts.length > 0 && (
        <div className="space-y-1 mb-3">
          {system.alerts.map((alert, i) => (
            <div key={i} className={`flex items-center gap-1.5 text-xs ${alert.severity === "CRITICAL" ? "text-status-critical" : "text-status-warning"}`}>
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              <span>{alert.label} ({alert.count})</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className={`flex items-center gap-1.5 text-xs ${system.isStale ? "text-status-warning stale-indicator" : "text-muted-foreground"}`}>
        <Clock className="w-3 h-3" />
        <span>{system.isStale ? "⚠ Stale: " : ""}{timeAgo(system.lastSnapshot)}</span>
      </div>
    </div>
  );
}
