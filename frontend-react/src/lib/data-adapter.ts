/**
 * Adapte les réponses de l'API SAPscope vers les types attendus par les composants Lovable.
 */

import type { SAPSystem, ClientOverview, HealthStatus, Tier } from "@/types/sap";
import type { ApiSnapshot, ApiClient, ApiHistoryResult } from "./api";
import { classifyTier } from "./sap-utils";

// ── System type detection (fallback frontend si payload ancien) ───────────────

function detectSystemType(
  payloadType: string | undefined,
  components: { component: string }[],
  sid: string,
): string {
  if (payloadType && payloadType !== "Unknown") return payloadType;

  const comps = new Set(components.map(c => c.component?.toUpperCase() ?? ""));
  if (comps.has("S4CORE"))                                         return "S/4HANA";
  if (comps.has("DW4CORE"))                                        return "BW/4HANA";
  if (comps.has("BW") || comps.has("BI_CONT"))                     return "BW";
  if (comps.has("LCMGT"))                                          return "SolMan";
  if (comps.has("XICORE") || comps.has("XI_BASIS"))                return "PI/PO";
  if (comps.has("BBPCRM") || comps.has("CRM_APPLICATION"))        return "CRM";
  if (comps.has("SRMSERVER"))                                      return "SRM";
  if (comps.has("GRCFND_A"))                                       return "GRC";
  if (comps.has("SAP_GWFND") && !comps.has("SAP_APPL"))           return "Fiori";
  if (comps.has("SAP_APPL") || comps.has("EA-APPL"))              return "ECC";
  if (comps.has("SAP_BASIS"))                                      return "ABAP";

  // Fallback SID heuristique (si pas de données composants)
  const s = sid.toUpperCase();
  if (/SOL|SM\d/.test(s))  return "SolMan";
  if (/^PI|^XI/.test(s))   return "PI/PO";
  if (/BW/.test(s))        return "BW";
  if (/S4|HAN/.test(s))    return "S/4HANA";
  return "ABAP";
}

// ── Transport line resolution ─────────────────────────────────────────────────

type StmsRoute   = { from: string; to: string; route_name: string };
type StmsSystem  = { sid: string; is_dc: boolean };

/**
 * Derive transport route name for a system.
 * Priority: STMS TMSROUTE data > SID/release heuristic.
 * Returns the route_name that connects this system to others.
 */
function resolveTransportLine(
  sid: string,
  release: string | null,
  stmsDomain: { routes?: StmsRoute[]; domain_systems?: StmsSystem[] } | null,
  systemType: string,
): string {
  const routes: StmsRoute[] = stmsDomain?.routes ?? [];
  if (routes.length > 0) {
    const mine = routes.find(r => r.from === sid || r.to === sid);
    if (mine?.route_name) return mine.route_name;
  }
  // SID/release heuristic
  const s = sid.toUpperCase();
  const r = (release || "").toUpperCase();
  if (/BW/.test(s) || r.includes("BW"))             return "BW";
  if (/S4|S\/4|HANA/.test(s) || r.includes("S/4")) return "S4";
  // Fallback sur le type détecté par composants — un S/4HANA ne doit jamais tomber en ECC
  if (systemType === "S/4HANA" || systemType === "BW/4HANA") return "S4";
  if (systemType === "BW")                                    return "BW";
  return "ECC";
}

function isDomainController(
  sid: string,
  stmsDomain: { domain_systems?: StmsSystem[] } | null,
): boolean {
  const systems: StmsSystem[] = stmsDomain?.domain_systems ?? [];
  return systems.some(s => s.sid === sid && s.is_dc);
}

// ── Tier mapping ──────────────────────────────────────────────────────────────

function apiTierToLovable(sid: string, host: string): Tier {
  const t = classifyTier(sid, host);
  const map: Record<string, Tier> = {
    pro:     "Production",
    preprod: "Pre-Production",
    qal:     "Quality",
    dev:     "Development",
    sandbox: "Sandbox",
    other:   "Development",
  };
  return map[t] || "Development";
}

// ── SnapshotSummary → SAPSystem ───────────────────────────────────────────────

export function snapshotToSystem(snap: ApiSnapshot, clientId = ""): SAPSystem {
  const hc     = snap.health;
  const status = (hc?.status === "UNKNOWN" ? "WARNING" : hc?.status ?? "WARNING") as HealthStatus;
  const score  = hc?.score ?? 0;
  const tier   = apiTierToLovable(snap.system_sid, snap.system_host);

  const kern = snap.kernel_release
    ? `${snap.kernel_release}${snap.kernel_patch ? " Patch " + snap.kernel_patch : ""}`
    : "—";
  const sp = snap.basis_sp ? `SP ${snap.basis_sp.padStart(4, "0")}` : "—";

  const alerts: SAPSystem["alerts"] = [];
  if (snap.security_critical && snap.security_default_users.length > 0)
    alerts.push({ type: "default_users", label: "Default SAP users active", count: snap.security_default_users.length, severity: "CRITICAL" });
  if (snap.security_sap_all_count > 0)
    alerts.push({ type: "sap_all", label: "Users with SAP_ALL", count: snap.security_sap_all_count, severity: "CRITICAL" });
  if ((snap.transport_queue ?? 0) > 50)
    alerts.push({ type: "transport_backlog", label: "Transport queue backlog", count: snap.transport_queue!, severity: "WARNING" });
  if ((snap.bg_jobs_delayed ?? 0) > 0)
    alerts.push({ type: "delayed_jobs", label: "Delayed background jobs", count: snap.bg_jobs_delayed!, severity: "WARNING" });
  if ((snap.update_errors ?? 0) > 0)
    alerts.push({ type: "sm13_errors", label: "SM13 update errors", count: snap.update_errors!, severity: "CRITICAL" });

  const staleMs = Date.now() - new Date(snap.collected_at).getTime();

  return {
    id:                 clientId ? `${clientId}__${snap.id}` : snap.id,
    sid:                snap.system_sid,
    hostname:           snap.system_host,
    tier,
    systemType:           detectSystemType(
                            snap.payload?.system_type,
                            Array.isArray(snap.payload?.components) ? snap.payload.components : [],
                            snap.system_sid,
                          ),
    transportLine:        resolveTransportLine(
                            snap.system_sid,
                            snap.system_release,
                            snap.payload?.stms_domain ?? null,
                            detectSystemType(
                              snap.payload?.system_type,
                              Array.isArray(snap.payload?.components) ? snap.payload.components : [],
                              snap.system_sid,
                            ),
                          ),
    stmsDomainController: isDomainController(snap.system_sid, snap.payload?.stms_domain ?? null),
    stmsRoutes:           (snap.payload?.stms_domain?.routes ?? []).map((r: StmsRoute) => ({
                            from:      r.from,
                            to:        r.to,
                            routeName: r.route_name,
                          })),
    sapRelease:           snap.system_release ?? "—",
    basisSP:              sp,
    kernelVersion:        kern,
    dbType:               snap.db_type ?? "—",
    dbVersion:            snap.payload?.db_stats?.hana_version ?? snap.payload?.db_stats?.db_version ?? "—",
    healthScore:          score,
    healthStatus:         status,
    avgDialogResponse:    snap.avg_response_ms ?? 0,
    alerts,
    lastSnapshot:         snap.collected_at,
    isStale:              staleMs > 86_400_000,
    unicode:              snap.unicode ?? false,
    installationNumber:   snap.installation_no ?? "—",
  };
}

// ── Snapshots[] → ClientOverview ─────────────────────────────────────────────

export function buildClientOverview(
  client: ApiClient,
  snapshots: ApiSnapshot[],
  history?: ApiHistoryResult,
): ClientOverview {
  const systems = snapshots.map(s => snapshotToSystem(s, client.id));
  const scored  = systems.filter(s => s.healthStatus !== "WARNING" || s.healthScore > 0);

  const avgHealthScore = scored.length
    ? Math.round(scored.reduce((a, s) => a + s.healthScore, 0) / scored.length)
    : 0;

  const okSystems       = systems.filter(s => s.healthStatus === "OK").length;
  const warningSystems  = systems.filter(s => s.healthStatus === "WARNING").length;
  const criticalSystems = systems.filter(s => s.healthStatus === "CRITICAL").length;
  const totalAlerts     = systems.reduce((a, s) => a + s.alerts.length, 0);

  const lastSnapshot = snapshots.length
    ? snapshots.reduce((latest, s) =>
        new Date(s.collected_at) > new Date(latest) ? s.collected_at : latest,
        snapshots[0].collected_at)
    : new Date().toISOString();

  // Historique réel si disponible, sinon score courant répété
  const healthHistory: number[] = history?.daily_avg.length
    ? history.daily_avg.map(d => d.score)
    : [avgHealthScore];

  return {
    id:               client.id,
    name:             client.name,
    industry:         "SAP Customer",
    systemCount:      snapshots.length,
    lastSnapshot,
    agentTokenStatus: "active",
    avgHealthScore,
    criticalSystems,
    warningSystems,
    okSystems,
    totalAlerts,
    systems: systems.slice(0, 12).map(s => ({
      sid: s.sid, tier: s.tier, healthScore: s.healthScore, healthStatus: s.healthStatus,
    })),
    healthHistory,
  };
}
