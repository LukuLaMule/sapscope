"use strict";

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  token:     sessionStorage.getItem("sapscope_token") || "",
  baseUrl:   localStorage.getItem("sapscope_url")    || "",
  clientId:  sessionStorage.getItem("sapscope_client") || "",
  snapshots: [],
  selected:  null,
};

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const url = state.baseUrl.replace(/\/$/, "") + path;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${state.token}`,
      "Content-Type":  "application/json",
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    logout();
    throw new Error("Session expired — please log in again");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiLogin(email, password) {
  const url = state.baseUrl.replace(/\/$/, "") + "/api/v1/auth/login";
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function loadClients() {
  return apiFetch("/api/v1/admin/clients?limit=200");
}

async function loadSnapshots(clientId) {
  return apiFetch(`/api/v1/clients/${clientId}/snapshots?limit=200`);
}

async function loadDetail(clientId, snapshotId) {
  return apiFetch(`/api/v1/clients/${clientId}/snapshots/${snapshotId}`);
}

async function loadAnalysis(clientId, snapshotId) {
  return apiFetch(`/api/v1/clients/${clientId}/snapshots/${snapshotId}/analysis`);
}

async function requestAnalysis(clientId, snapshotId, force = false) {
  return apiFetch(
    `/api/v1/clients/${clientId}/snapshots/${snapshotId}/analysis?force=${force}`,
    { method: "POST" }
  );
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function logout() {
  sessionStorage.removeItem("sapscope_token");
  sessionStorage.removeItem("sapscope_client");
  state.token    = "";
  state.clientId = "";
  showLoginScreen();
}

// ── Screens ───────────────────────────────────────────────────────────────────

function showLoginScreen() {
  document.getElementById("login-screen").style.display  = "flex";
  document.getElementById("app-screen").style.display    = "none";
}

function showAppScreen() {
  document.getElementById("login-screen").style.display  = "none";
  document.getElementById("app-screen").style.display    = "flex";
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderClientSelector(clients) {
  const sel = document.getElementById("client-select");
  sel.innerHTML = clients.map(c =>
    `<option value="${esc(c.id)}">${esc(c.name)}</option>`
  ).join("");

  // Restore previous selection
  if (state.clientId && clients.find(c => c.id === state.clientId)) {
    sel.value = state.clientId;
  } else if (clients.length) {
    state.clientId = clients[0].id;
    sel.value = state.clientId;
    sessionStorage.setItem("sapscope_client", state.clientId);
  }

  sel.onchange = async () => {
    state.clientId = sel.value;
    sessionStorage.setItem("sapscope_client", state.clientId);
    await loadAndRenderSnapshots();
  };
}

async function loadAndRenderSnapshots() {
  document.getElementById("system-list").innerHTML =
    `<div class="placeholder" style="padding:12px 14px;font-size:11px">Loading…</div>`;
  document.getElementById("content").innerHTML =
    `<div class="placeholder">Select a system.</div>`;

  const snapshots = await loadSnapshots(state.clientId);

  // Deduplicate — latest per SID
  const bySystem = new Map();
  for (const s of snapshots) {
    if (!bySystem.has(s.system_sid) ||
        new Date(s.collected_at) > new Date(bySystem.get(s.system_sid).collected_at)) {
      bySystem.set(s.system_sid, s);
    }
  }
  state.snapshots = [...bySystem.values()].sort((a, b) => a.system_sid.localeCompare(b.system_sid));
  renderSidebar(state.snapshots);

  if (state.snapshots.length === 0) {
    document.getElementById("content").innerHTML =
      `<div class="placeholder">No snapshots yet.<div class="hint">Run the agent on a SAP server.</div></div>`;
  } else {
    document.querySelector(".system-item")?.click();
  }
}

function renderSidebar(snapshots) {
  const list = document.getElementById("system-list");
  list.innerHTML = "";
  for (const snap of snapshots) {
    const el = document.createElement("div");
    el.className  = "system-item";
    el.dataset.id = snap.id;
    el.innerHTML  = `
      <div class="sid">${esc(snap.system_sid)}</div>
      <div class="host">${esc(snap.system_host)}</div>
      <div class="age">${relativeTime(snap.collected_at)}</div>`;
    el.addEventListener("click", () => selectSnapshot(snap.id, el));
    list.appendChild(el);
  }
}

async function selectSnapshot(id, el) {
  document.querySelectorAll(".system-item").forEach(i => i.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("content").innerHTML = `<div class="placeholder">Loading…</div>`;

  const snap = await loadDetail(state.clientId, id);
  state.selected = snap;
  renderDetail(snap);
}

function renderDetail(snap) {
  const p   = snap.payload;
  const sys = p.system || {};
  const content = document.getElementById("content");

  content.innerHTML = `
    <div id="sys-header">
      ${kv("SID",       sys.rfcsysid  || "—", true)}
      ${kv("Host",      sys.rfchost   || "—")}
      ${kv("OS",        sys.rfcopsys  || "—")}
      ${kv("DB",        sys.rfcdbsys  || "—")}
      ${kv("SAP rel",   sys.rfcsaprl  || "—")}
      ${kv("Kernel",    sys.rfckernrl || "—")}
      ${kv("DB host",   sys.rfcdbhost || "—")}
      ${kv("Collected", fmtDate(snap.collected_at))}
    </div>

    <div class="section">
      <div class="section-title">Components (${p.components.length})</div>
      ${tableComponents(p.components)}
    </div>

    <div class="section">
      <div class="section-title">Support Packages (${p.support_packages.length})</div>
      ${tableSP(p.support_packages)}
    </div>

    <div class="section">
      <div class="section-title">Custom Objects — ${p.custom_objects.total.toLocaleString()} total</div>
      ${renderObjBars(p.custom_objects.by_type)}
    </div>

    <div class="section" id="analysis-section">
      <div class="section-title" style="display:flex;align-items:center;gap:12px">
        <span>AI Analysis</span>
        <button class="analyse-btn" id="analyse-btn">analyse</button>
        <span id="analysis-meta" style="color:var(--text-dim);font-size:var(--fs-sm)"></span>
      </div>
      <div id="analysis-content">
        <div class="placeholder" style="padding:16px 0">Press analyse to generate a Claude assessment.</div>
      </div>
    </div>`;

  // Load cached analysis silently
  loadAnalysis(state.clientId, snap.id)
    .then(a => renderAnalysis(a))
    .catch(() => {});

  document.getElementById("analyse-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "running…";
    document.getElementById("analysis-content").innerHTML =
      `<div class="placeholder" style="padding:16px 0">Calling Claude…</div>`;
    try {
      const a = await requestAnalysis(state.clientId, snap.id, true);
      renderAnalysis(a);
    } catch (err) {
      document.getElementById("analysis-content").innerHTML =
        `<div class="placeholder" style="color:var(--danger);padding:16px 0">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "re-analyse";
    }
  });
}

function renderAnalysis(a) {
  const meta = document.getElementById("analysis-meta");
  const box  = document.getElementById("analysis-content");
  if (!meta || !box) return;
  meta.textContent = `${a.model} · ${(a.input_tokens + a.output_tokens).toLocaleString()} tokens · ${fmtDate(a.created_at)}`;
  box.innerHTML = `<div class="analysis-body">${mdToHtml(a.content)}</div>`;
  const btn = document.getElementById("analyse-btn");
  if (btn) btn.textContent = "re-analyse";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function kv(label, value, accent = false) {
  return `<div class="kv">
    <div class="k">${esc(label)}</div>
    <div class="v${accent ? " accent" : ""}">${esc(value)}</div>
  </div>`;
}

function tableComponents(rows) {
  if (!rows.length) return `<div class="placeholder">No data</div>`;
  const sorted = [...rows].sort((a, b) => a.component.localeCompare(b.component));
  const body = sorted.map(r => `<tr>
    <td class="hi">${esc(r.component)}</td>
    <td>${esc(r.release)}</td>
    <td class="dim">${esc(r.extrelease)}</td>
    <td class="dim">${esc(r.description)}</td>
  </tr>`).join("");
  return `<table class="data-table">
    <thead><tr><th>Component</th><th>Release</th><th>SP Level</th><th>Description</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function tableSP(rows) {
  if (!rows.length) return `<div class="placeholder">No data</div>`;
  const sorted = [...rows].sort((a, b) =>
    a.component.localeCompare(b.component) || a.applied.localeCompare(b.applied));
  const body = sorted.map(r => `<tr>
    <td class="hi">${esc(r.component)}</td>
    <td>${esc(r.patch)}</td>
    <td class="dim">${esc(r.type)}</td>
    <td class="dim">${fmtSAPDate(r.applied)}</td>
  </tr>`).join("");
  return `<table class="data-table">
    <thead><tr><th>Component</th><th>Patch</th><th>Type</th><th>Applied</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function renderObjBars(byType) {
  if (!byType || !Object.keys(byType).length)
    return `<div class="placeholder">No custom objects</div>`;
  const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const max = entries[0][1];
  const bars = entries.map(([type, count]) => {
    const pct = Math.round((count / max) * 100);
    return `<div class="obj-bar-row">
      <span class="type-lbl">${esc(type)}</span>
      <div class="obj-bar-track"><div class="obj-bar-fill" style="width:${pct}%"></div></div>
      <span class="count">${count.toLocaleString()}</span>
    </div>`;
  }).join("");
  return `<div id="obj-bars">${bars}</div>`;
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const out   = [];
  let inUl    = false;

  for (const raw of lines) {
    const line = raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    if (/^## (.+)$/.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      out.push(`<h3>${line.slice(3)}</h3>`);
    } else if (/^### (.+)$/.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      out.push(`<h4>${line.slice(4)}</h4>`);
    } else if (/^- (.+)$/.test(line)) {
      if (!inUl) { out.push('<ul>'); inUl = true; }
      const item = line.slice(2).replace(/\*\*(.{1,200}?)\*\*/g, '<strong>$1</strong>');
      out.push(`<li>${item}</li>`);
    } else if (line.trim() === '') {
      if (inUl) { out.push('</ul>'); inUl = false; }
      out.push('<br>');
    } else {
      if (inUl) { out.push('</ul>'); inUl = false; }
      const para = line.replace(/\*\*(.{1,200}?)\*\*/g, '<strong>$1</strong>');
      out.push(`<p>${para}</p>`);
    }
  }
  if (inUl) out.push('</ul>');
  return out.join('\n');
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function fmtSAPDate(s) {
  if (!s || s.length !== 8) return s || "—";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function setStatus(ok) {
  document.getElementById("status-dot").className = ok ? "ok" : "err";
}

function validateBackendUrl(raw) {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "https:" && location.protocol === "https:")
      throw new Error("Backend URL must use HTTPS");
    return parsed.origin;
  } catch (e) {
    throw new Error("Invalid backend URL: " + e.message);
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  const emailEl = document.getElementById("login-email");
  const passEl  = document.getElementById("login-pass");
  const urlEl   = document.getElementById("login-url");
  const errEl   = document.getElementById("login-error");
  const btn     = document.getElementById("login-btn");

  errEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "connecting…";

  try {
    state.baseUrl = validateBackendUrl(urlEl.value);
    localStorage.setItem("sapscope_url", state.baseUrl);

    const { token, user_id } = await apiLogin(emailEl.value.trim(), passEl.value);
    state.token = token;
    sessionStorage.setItem("sapscope_token", token);

    setStatus(true);
    showAppScreen();
    await initApp();
  } catch (err) {
    errEl.textContent = err.message;
    setStatus(false);
  } finally {
    btn.disabled = false;
    btn.textContent = "connect";
  }
}

// ── App init ──────────────────────────────────────────────────────────────────

async function initApp() {
  try {
    const clients = await loadClients();
    renderClientSelector(clients);
    if (clients.length) await loadAndRenderSnapshots();
  } catch (err) {
    document.getElementById("content").innerHTML =
      `<div class="placeholder" style="color:var(--danger)">${esc(err.message)}</div>`;
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Login form
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("logout-btn").addEventListener("click", logout);

  // Pre-fill URL
  document.getElementById("login-url").value = localStorage.getItem("sapscope_url") || "";

  // Auto-login if token still in session
  if (state.token && state.baseUrl) {
    showAppScreen();
    setStatus(true);
    initApp().catch(() => logout());
  } else {
    showLoginScreen();
  }
});
