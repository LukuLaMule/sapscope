export type HealthStatus = "OK" | "WARNING" | "CRITICAL";
export type Tier = "Production" | "Pre-Production" | "Quality" | "Development" | "Sandbox";

export interface SAPAlert {
  type: "default_users" | "sap_all" | "transport_backlog" | "delayed_jobs" | "sm13_errors";
  label: string;
  count: number;
  severity: HealthStatus;
}

export interface SAPSystem {
  id: string;
  sid: string;
  hostname: string;
  tier: Tier;
  sapRelease: string;
  basisSP: string;
  kernelVersion: string;
  dbType: string;
  dbVersion: string;
  healthScore: number;
  healthStatus: HealthStatus;
  avgDialogResponse: number; // ms
  alerts: SAPAlert[];
  lastSnapshot: string; // ISO date
  isStale: boolean;
  unicode: boolean;
  installationNumber: string;
  transportLine?: string;          // route name from STMS (or heuristic fallback)
  stmsDomainController?: boolean;  // true if this system is the STMS domain controller
  stmsRoutes?: { from: string; to: string; routeName: string }[]; // connexions STMS explicites
  systemType?: string;             // type fonctionnel : S/4HANA · BW · ECC · SolMan · PI/PO…
}

export interface HealthDomain {
  name: string;
  score: number;
  status: HealthStatus;
  indicators: { label: string; value: string; status: HealthStatus }[];
}

export interface InstalledComponent {
  name: string;
  release: string;
  supportPackage: string;
  description: string;
}

export interface WorkProcess {
  type: "dialog" | "background" | "spool" | "update" | "enqueue";
  count: number;
}

export interface AppServer {
  hostname: string;
  instance: string;
  workProcesses: WorkProcess[];
}

export interface SystemDetail extends SAPSystem {
  healthDomains: HealthDomain[];
  components: InstalledComponent[];
  supportPackages: { name: string; version: string; date: string }[];
  customObjects: { type: string; count: number }[];
  defaultUsersActive: { user: string; status: string }[];
  sapAllUsers: number;
  transportQueueSize: number;
  lastTransportImport: string;
  activeJobs: number;
  delayedJobs: number;
  appServers: AppServer[];
}

export interface ClientOverview {
  id: string;
  name: string;
  industry: string;
  logo?: string;
  systemCount: number;
  lastSnapshot: string;
  agentTokenStatus: "active" | "expired" | "revoked";
  avgHealthScore: number;
  criticalSystems: number;
  warningSystems: number;
  okSystems: number;
  totalAlerts: number;
  systems: { sid: string; tier: Tier; healthScore: number; healthStatus: HealthStatus }[];
  healthHistory: number[]; // 30 days of health scores
}

export interface Client {
  id: string;
  name: string;
  systemCount: number;
  lastSnapshot: string;
  agentTokenStatus: "active" | "expired" | "revoked";
}

export interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  clients: string[];
}

export interface AgentToken {
  id: string;
  clientId: string;
  clientName: string;
  token: string;
  status: "active" | "revoked";
  createdAt: string;
}

export interface Snapshot {
  date: string;
  healthScore: number;
  healthStatus: HealthStatus;
  kernelVersion: string;
  basisSP: string;
  securityStatus: HealthStatus;
  components: { name: string; version: string }[];
  sapAllUsers: number;
  transportQueueSize: number;
}

export interface AgentHealth {
  client_id: string;
  last_seen_at: string | null;
  agent_version: string | null;
  monitored_sids: string[];
  collection_interval_minutes: number | null;
  status: "ok" | "warning" | "down";
  age_minutes: number | null;
}

export interface DecommissionCandidate {
  id: string;
  client_id: string;
  system_sid: string;
  reason: string;
  detected_at: string;
}
