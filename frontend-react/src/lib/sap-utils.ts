import type { HealthStatus } from "@/types/sap";

export function getStatusColor(status: HealthStatus): string {
  switch (status) {
    case "OK": return "text-status-ok";
    case "WARNING": return "text-status-warning";
    case "CRITICAL": return "text-status-critical";
  }
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "OK":       return "status-badge-ok";
    case "WARNING":  return "status-badge-warning";
    case "CRITICAL": return "status-badge-critical";
    default:         return "status-badge-warning";
  }
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "text-status-ok";
  if (score >= 50) return "text-status-warning";
  return "text-status-critical";
}

export function getScoreBorderColor(score: number): string {
  if (score >= 80) return "border-status-ok";
  if (score >= 50) return "border-status-warning";
  return "border-status-critical";
}

export function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-status-ok/15";
  if (score >= 50) return "bg-status-warning/15";
  return "bg-status-critical/15";
}

export function getTierBadgeClass(tier: string): string {
  switch (tier) {
    case "Production": return "tier-badge-production";
    case "Pre-Production": return "tier-badge-quality";
    case "Quality": return "tier-badge-quality";
    case "Development": return "tier-badge-development";
    case "Sandbox": return "bg-muted text-muted-foreground border border-muted-foreground/20";
    default: return "";
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Classifie un SID SAP en tier interne (pro/preprod/qal/dev/sandbox/other) */
export function classifyTier(sid: string, host = ""): string {
  const s = sid.toUpperCase();
  const h = host.toLowerCase();
  if (/SBX|SND|FOR|TRN|TRAIN|PLAY/.test(s)) return "sandbox";
  if (/^DEV$|^D[0-9A-Z]{1,2}$/.test(s))     return "dev";
  if (/QAS|QAL|TST|TEST|UAT|VAL|REC/.test(s) || /^Q[0-9A-Z]{1,2}$/.test(s)) return "qal";
  if (/PREPROD|PPD|STG|STAGE/.test(s) || /^PP[A-Z0-9]/.test(s)) return "preprod";
  if (/^PRD$|^PROD$/.test(s) || /^P[0-9A-Z]{1,2}$/.test(s)) return "pro";
  if (/DEV/.test(s)) return "dev";
  if (/PRD|PROD/.test(s)) return "pro";
  if (/QAS|QAL|TST|UAT/.test(s)) return "qal";
  if (/preprod|ppd/.test(h)) return "preprod";
  if (/prd|prod/.test(h))   return "pro";
  if (/qas|test|uat/.test(h)) return "qal";
  if (/dev/.test(h))        return "dev";
  if (/sbx|sand/.test(h))   return "sandbox";
  return "other";
}
