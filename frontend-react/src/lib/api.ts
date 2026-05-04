/**
 * API client — connecte l'app Lovable au backend SAPscope (FastAPI).
 * Toutes les requêtes portent le JWT stocké dans sessionStorage.
 */

const BASE = window.location.origin;

function getToken(): string {
  return sessionStorage.getItem("sapscope_token") || "";
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    sessionStorage.removeItem("sapscope_token");
    window.location.reload();
    throw new Error("Session expirée");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse { token: string; user_id: string; email: string; is_admin: boolean }

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface MeResponse { user_id: string; email: string; is_admin: boolean }

export const fetchMe = (): Promise<MeResponse> =>
  apiFetch("/api/v1/auth/me");

// ── History ───────────────────────────────────────────────────────────────────

export interface ApiHistoryEntry  { date: string; score: number; status: string }
export interface ApiHistoryResult {
  days:      number;
  by_sid:    Record<string, ApiHistoryEntry[]>;
  daily_avg: { date: string; score: number }[];
}

export const fetchHistory = (clientId: string, days = 30): Promise<ApiHistoryResult> =>
  apiFetch(`/api/v1/clients/${clientId}/history?days=${days}`);

// ── Clients ───────────────────────────────────────────────────────────────────

export interface ApiClient { id: string; name: string; logo_b64?: string | null; created_at: string }

export const fetchClients = (): Promise<ApiClient[]> =>
  apiFetch("/api/v1/clients?limit=200");

// ── Snapshots ─────────────────────────────────────────────────────────────────

export interface ApiHealth {
  score: number;
  status: "OK" | "WARNING" | "CRITICAL" | "UNKNOWN";
  indicators: Record<string, any>;
}

export interface ApiSnapshot {
  id: string;
  system_sid: string;
  system_host: string;
  collected_at: string;
  received_at: string;
  components_count: number;
  support_packages_count: number;
  custom_objects_count: number;
  system_release: string | null;
  db_type: string | null;
  health: ApiHealth | null;
  kernel_release: string | null;
  kernel_patch: string | null;
  basis_sp: string | null;
  unicode: boolean | null;
  installation_no: string | null;
  security_critical: boolean;
  security_sap_all_count: number;
  security_default_users: string[];
  transport_queue: number | null;
  bg_jobs_delayed: number | null;
  update_errors: number | null;
  spool_pending: number | null;
  avg_response_ms: number | null;
  payload?: Record<string, any>;
}

export interface ApiSnapshotDetail extends ApiSnapshot {
  payload: Record<string, any>;
}

export const fetchSnapshots = (clientId: string): Promise<ApiSnapshot[]> =>
  apiFetch(`/api/v1/clients/${clientId}/snapshots?limit=200`);

export const fetchSnapshotDetail = (clientId: string, snapId: string): Promise<ApiSnapshotDetail> =>
  apiFetch(`/api/v1/clients/${clientId}/snapshots/${snapId}`);

// ── Cross-system / latest snapshots ──────────────────────────────────────────

export interface ApiLatestSnapshot {
  id:           string;
  client_id:    string;
  client_name:  string;
  system_sid:   string;
  collected_at: string;
  health:       { score: number; status: string } | null;
}

export const fetchLatestSnapshots = (limit = 50): Promise<ApiLatestSnapshot[]> =>
  apiFetch(`/api/v1/snapshots/latest?limit=${limit}`);

export interface ApiCrossSystemDiff {
  snap_a:           { id: string; collected_at: string; system_sid: string };
  snap_b:           { id: string; collected_at: string; system_sid: string };
  cross_system:     boolean;
  system_a:         string;
  system_b:         string;
  system_changes:   { field: string; label: string; old: string; new: string }[];
  components:       { added: any[]; removed: any[]; changed: any[] };
  support_packages: { added: any[]; removed: any[]; changed: any[] };
  custom_objects:   { total_delta: number; by_type_delta: Record<string, number> };
}

export const fetchCrossSystemDiff = (
  clientIdA: string,
  snapIdA: string,
  snapIdB: string,
  clientIdB?: string,
): Promise<ApiCrossSystemDiff> => {
  const params = new URLSearchParams({ base: snapIdB, cross_system: "true" });
  if (clientIdB && clientIdB !== clientIdA) params.set("base_client_id", clientIdB);
  return apiFetch(`/api/v1/clients/${clientIdA}/snapshots/${snapIdA}/diff?${params}`);
};

// ── Analysis ──────────────────────────────────────────────────────────────────

export interface ApiAnalysis {
  id: string;
  model: string;
  language: string;
  input_tokens: number;
  output_tokens: number;
  content: string;
  created_at: string;
}

export const fetchAnalysis = (clientId: string, snapId: string): Promise<ApiAnalysis | null> =>
  apiFetch(`/api/v1/clients/${clientId}/snapshots/${snapId}/analysis`);

export const requestAnalysis = (clientId: string, snapId: string, force = false, language = "English"): Promise<ApiAnalysis> =>
  apiFetch(`/api/v1/clients/${clientId}/snapshots/${snapId}/analysis?force=${force}&language=${encodeURIComponent(language)}`, { method: "POST" });

// ── Billing / Onboarding ──────────────────────────────────────────────────────

export interface ApiOnboarding {
  token:       string | null;
  client_id:   string | null;
  client_name: string;
}

export const fetchOnboarding = (): Promise<ApiOnboarding> =>
  apiFetch("/api/v1/billing/onboarding");

// ── Notes ─────────────────────────────────────────────────────────────────────

export interface ApiNote {
  id: string;
  system_sid: string;
  content: string;
  author_email: string;
  created_at: string;
  updated_at: string | null;
}

export const fetchNotes = (clientId: string, sid: string): Promise<ApiNote[]> =>
  apiFetch(`/api/v1/clients/${clientId}/systems/${sid}/notes`);

export const createNote = (clientId: string, sid: string, content: string): Promise<ApiNote> =>
  apiFetch(`/api/v1/clients/${clientId}/systems/${sid}/notes`, { method: "POST", body: JSON.stringify({ content }) });

export const updateNote = (clientId: string, sid: string, noteId: string, content: string): Promise<ApiNote> =>
  apiFetch(`/api/v1/clients/${clientId}/systems/${sid}/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ content }) });

export const deleteNote = (clientId: string, sid: string, noteId: string): Promise<void> =>
  apiFetch(`/api/v1/clients/${clientId}/systems/${sid}/notes/${noteId}`, { method: "DELETE" });

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  client_ids: string[];
}

export interface ApiToken {
  id: string;
  label: string;
  is_revoked: boolean;
  created_at: string;
}

export interface ApiTokenCreated extends ApiToken { token: string }

export const fetchAdminClients = (): Promise<ApiClient[]> =>
  apiFetch("/api/v1/admin/clients?limit=200");

export const createAdminClient = (name: string): Promise<ApiClient> =>
  apiFetch(`/api/v1/admin/clients?name=${encodeURIComponent(name)}`, { method: "POST" });

export const deleteAdminClient = (id: string): Promise<void> =>
  apiFetch(`/api/v1/admin/clients/${id}`, { method: "DELETE" });

export const updateClientLogo = (id: string, logo_b64: string | null): Promise<void> =>
  apiFetch(`/api/v1/admin/clients/${id}/logo`, { method: "PATCH", body: JSON.stringify({ logo_b64 }) });

export const fetchUsers = (): Promise<ApiUser[]> =>
  apiFetch("/api/v1/admin/users?limit=200");

export const createUser = (email: string, password: string, is_admin = false): Promise<ApiUser> =>
  apiFetch("/api/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, is_admin }) });

export const fetchTokens = (clientId: string): Promise<ApiToken[]> =>
  apiFetch(`/api/v1/admin/clients/${clientId}/tokens`);

export const issueToken = (clientId: string, label: string): Promise<ApiTokenCreated> =>
  apiFetch(`/api/v1/admin/clients/${clientId}/tokens?label=${encodeURIComponent(label)}`, { method: "POST" });

export const revokeToken = (clientId: string, tokenId: string): Promise<void> =>
  apiFetch(`/api/v1/admin/clients/${clientId}/tokens/${tokenId}`, { method: "DELETE" });

export const assignClient = (userId: string, clientId: string): Promise<void> =>
  apiFetch(`/api/v1/admin/users/${userId}/clients/${clientId}`, { method: "POST" });

export const unassignClient = (userId: string, clientId: string): Promise<void> =>
  apiFetch(`/api/v1/admin/users/${userId}/clients/${clientId}`, { method: "DELETE" });

// ── Report config ─────────────────────────────────────────────────────────────

export interface ApiReportConfig {
  enabled: boolean;
  recipient_emails: string[];
  schedule: "daily" | "weekly" | "monthly";
  schedule_day: number;
  language: "fr" | "en";
  last_sent_at: string | null;
  report_title: string | null;
  include_health_domains: boolean;
  include_key_metrics: boolean;
  include_ai_analysis: boolean;
}

export const fetchReportConfig = (clientId: string): Promise<ApiReportConfig> =>
  apiFetch(`/api/v1/clients/${clientId}/report-config`);

export const updateReportConfig = (clientId: string, data: Partial<ApiReportConfig>): Promise<ApiReportConfig> =>
  apiFetch(`/api/v1/clients/${clientId}/report-config`, { method: "PATCH", body: JSON.stringify(data) });

export const sendReportNow = (clientId: string): Promise<void> =>
  apiFetch(`/api/v1/clients/${clientId}/report/send`, { method: "POST" });

export async function downloadReportPdf(clientId: string, clientName: string): Promise<void> {
  const BASE = window.location.origin;
  const token = sessionStorage.getItem("sapscope_token") || "";
  const res = await fetch(`${BASE}/api/v1/clients/${clientId}/report/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    sessionStorage.removeItem("sapscope_token");
    window.location.reload();
    throw new Error("Session expirée");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).detail || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `rapport-${clientName.replace(/\s+/g, "-")}-${date}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  client_id: string;
  client_name: string;
  system_sid: string;
  severity: "warning" | "critical";
  message: string;
  created_at: string;
  read_at: string | null;
}

export const fetchNotifications = (unreadOnly = true): Promise<NotificationItem[]> =>
  apiFetch(`/api/v1/notifications?unread_only=${unreadOnly}`);

export const markNotificationRead = (id: string): Promise<void> =>
  apiFetch(`/api/v1/notifications/${id}/read`, { method: "PATCH" });

export const markAllNotificationsRead = (): Promise<void> =>
  apiFetch("/api/v1/notifications/read-all", { method: "POST" });

// ── License ───────────────────────────────────────────────────────────────────

export interface LicenseStatus {
  configured:    boolean;
  valid:         boolean;
  plan:          string | null;
  expires_at:    string | null;
  days_remaining: number | null;
  grace_mode:    boolean;
  reason:        string | null;
}

export async function fetchLicenseStatus(): Promise<LicenseStatus> {
  const res = await fetch(`${BASE}/api/license/status`);
  if (!res.ok) return { configured: false, valid: false, plan: null, expires_at: null, days_remaining: null, grace_mode: false, reason: null };
  return res.json();
}
