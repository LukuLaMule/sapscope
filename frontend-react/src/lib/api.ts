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

export interface ApiClient { id: string; name: string; created_at: string }

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
