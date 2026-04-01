"use strict";

// ── Color palette (one per SID) ───────────────────────────────────────────────

const SID_PALETTE = [
  { color: '#818cf8', dim: '#1a1a40', glow: 'rgba(129,140,248,0.15)', gradient: 'linear-gradient(135deg,#1e1b4b,#0d0d1a)' },
  { color: '#a78bfa', dim: '#2d1b50', glow: 'rgba(167,139,250,0.15)', gradient: 'linear-gradient(135deg,#2e1065,#0d0d1a)' },
  { color: '#34d399', dim: '#052e20', glow: 'rgba(52,211,153,0.15)',  gradient: 'linear-gradient(135deg,#064e3b,#0d0d1a)' },
  { color: '#60a5fa', dim: '#1a2e50', glow: 'rgba(96,165,250,0.15)', gradient: 'linear-gradient(135deg,#1e3a8a,#0d0d1a)' },
  { color: '#f472b6', dim: '#3d0e24', glow: 'rgba(244,114,182,0.15)', gradient: 'linear-gradient(135deg,#831843,#0d0d1a)' },
  { color: '#fb923c', dim: '#3d1508', glow: 'rgba(251,146,60,0.15)', gradient: 'linear-gradient(135deg,#7c2d12,#0d0d1a)' },
  { color: '#2dd4bf', dim: '#0a2e2b', glow: 'rgba(45,212,191,0.15)', gradient: 'linear-gradient(135deg,#134e4a,#0d0d1a)' },
  { color: '#fbbf24', dim: '#3d2a06', glow: 'rgba(251,191,36,0.15)', gradient: 'linear-gradient(135deg,#78350f,#0d0d1a)' },
  { color: '#f87171', dim: '#3d0a0a', glow: 'rgba(248,113,113,0.15)', gradient: 'linear-gradient(135deg,#7f1d1d,#0d0d1a)' },
  { color: '#a3e635', dim: '#1e2e05', glow: 'rgba(163,230,53,0.15)', gradient: 'linear-gradient(135deg,#365314,#0d0d1a)' },
];

// Chart palette (for donut slices & bars)
const CHART_COLORS = [
  '#22d3ee','#f43f5e','#f59e0b','#34d399','#e879f9',
  '#38bdf8','#f97316','#a3e635','#818cf8','#fb7185',
  '#10b981','#fbbf24',
];

function sidTheme(sid) {
  let h = 0;
  for (const c of (sid || 'X')) h = ((h << 5) - h) + c.charCodeAt(0);
  return SID_PALETTE[Math.abs(h) % SID_PALETTE.length];
}

function applyTheme(theme) {
  const r = document.documentElement;
  r.style.setProperty('--sys-color',    theme.color);
  r.style.setProperty('--sys-dim',      theme.dim);
  r.style.setProperty('--sys-glow',     theme.glow);
}

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  token:        sessionStorage.getItem("sapscope_token") || "",
  baseUrl:      window.location.origin,
  clientId:     sessionStorage.getItem("sapscope_client") || "",
  snapshots:    [],   // deduplicated — 1 per SID, latest only
  allSnapshots: [],   // full list, used for per-SID history
  selected:     null,
  isAdmin:      sessionStorage.getItem("sapscope_is_admin") === "1",
  lang:         localStorage.getItem("sapscope_lang") || "English",
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
  if (res.status === 401) { logout(); throw new Error("Session expired"); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function apiLogin(email, password) {
  const url = state.baseUrl.replace(/\/$/, "") + "/api/v1/auth/login";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiRegister(email, password) {
  const url = state.baseUrl.replace(/\/$/, "") + "/api/v1/auth/register";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

const loadClients   = ()           => apiFetch("/api/v1/clients?limit=200");
const loadSnapshots = (cid)        => apiFetch(`/api/v1/clients/${cid}/snapshots?limit=200`);
const loadDetail    = (cid, sid)   => apiFetch(`/api/v1/clients/${cid}/snapshots/${sid}`);
const loadAnalysis  = (cid, sid)   => apiFetch(`/api/v1/clients/${cid}/snapshots/${sid}/analysis`);
const requestAnalysis = (cid, sid, force=false, lang="English") =>
  apiFetch(`/api/v1/clients/${cid}/snapshots/${sid}/analysis?force=${force}&language=${encodeURIComponent(lang)}`, { method: "POST" });

// Admin API
const loadAdminClients      = ()          => apiFetch("/api/v1/admin/clients?limit=200");
const loadUsers             = ()          => apiFetch("/api/v1/admin/users?limit=200");
const createUser            = (body)      => apiFetch("/api/v1/admin/users", { method: "POST", body: JSON.stringify(body) });
const createAdminClient     = (name)      => apiFetch(`/api/v1/admin/clients?name=${encodeURIComponent(name)}`, { method: "POST" });
const issueToken            = (cid, lbl)  => apiFetch(`/api/v1/admin/clients/${cid}/tokens?label=${encodeURIComponent(lbl)}`, { method: "POST" });
const loadTokens            = (cid)       => apiFetch(`/api/v1/admin/clients/${cid}/tokens`);
const revokeToken           = (cid, tid)  => apiFetch(`/api/v1/admin/clients/${cid}/tokens/${tid}`, { method: "DELETE" });
const assignClientToUser    = (uid, cid)  => apiFetch(`/api/v1/admin/users/${uid}/clients/${cid}`, { method: "POST" });
const unassignClientFromUser = (uid, cid) => apiFetch(`/api/v1/admin/users/${uid}/clients/${cid}`, { method: "DELETE" });
const loadDiff              = (cid, snapId, baseId) => apiFetch(`/api/v1/clients/${cid}/snapshots/${snapId}/diff?base=${baseId}`);

// ── Auth ──────────────────────────────────────────────────────────────────────

function logout() {
  sessionStorage.removeItem("sapscope_token");
  sessionStorage.removeItem("sapscope_client");
  sessionStorage.removeItem("sapscope_is_admin");
  state.token = ""; state.clientId = ""; state.isAdmin = false;
  document.getElementById("admin-btn").style.display = "none";
  applyTheme(SID_PALETTE[0]);
  showLoginScreen();
}

// ── Screens ───────────────────────────────────────────────────────────────────

const showLoginScreen = () => {
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("app-screen").style.display   = "none";
};
const showAppScreen = () => {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app-screen").style.display   = "flex";
};

// ── Render: client selector ────────────────────────────────────────────────────

function renderClientSelector(clients) {
  const sel = document.getElementById("client-select");
  sel.innerHTML = clients.map(c =>
    `<option value="${esc(c.id)}">${esc(c.name)}</option>`
  ).join("");
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

// ── Render: sidebar ────────────────────────────────────────────────────────────

async function loadAndRenderSnapshots() {
  document.getElementById("system-list").innerHTML =
    `<div class="placeholder" style="padding:20px 0;font-size:11px">Loading…</div>`;
  document.getElementById("content").innerHTML =
    `<div class="placeholder">Select a system.</div>`;

  const snapshots = await loadSnapshots(state.clientId);
  state.allSnapshots = snapshots;

  const bySystem = new Map();
  for (const s of snapshots) {
    if (!bySystem.has(s.system_sid) ||
        new Date(s.collected_at) > new Date(bySystem.get(s.system_sid).collected_at))
      bySystem.set(s.system_sid, s);
  }
  state.snapshots = [...bySystem.values()].sort((a, b) => a.system_sid.localeCompare(b.system_sid));
  renderSidebar(state.snapshots);

  if (!state.snapshots.length) {
    renderOnboarding("no-snapshots");
  } else {
    document.querySelector(".system-item")?.click();
  }
}

function isStale(iso) {
  return (Date.now() - new Date(iso).getTime()) > 24 * 60 * 60 * 1000;
}

function renderSidebar(snapshots) {
  const list = document.getElementById("system-list");
  list.innerHTML = "";
  for (const snap of snapshots) {
    const theme  = sidTheme(snap.system_sid);
    const stale  = isStale(snap.collected_at);
    const el = document.createElement("div");
    el.className  = "system-item";
    el.dataset.id = snap.id;
    el.style.setProperty("--sys-color", theme.color);
    el.style.setProperty("--sys-dim",   theme.dim);
    el.innerHTML = `
      <div class="sid-badge">${esc(snap.system_sid)}</div>
      <div class="host">${esc(snap.system_host)}</div>
      <div class="meta">
        <span class="pill">${snap.components_count} comp</span>
        <span class="${stale ? 'stale-time' : ''}">${relativeTime(snap.collected_at)}</span>
      </div>
      ${stale ? `<div class="stale-badge" title="Dernière collecte il y a plus de 24h — vérifier l'agent">⚠ agent inactif</div>` : ''}`;
    el.addEventListener("click", () => selectSnapshot(snap.id, el, theme));
    list.appendChild(el);
  }
}

async function selectSnapshot(id, el, theme) {
  document.querySelectorAll(".system-item").forEach(i => i.classList.remove("active"));
  el.classList.add("active");
  applyTheme(theme);

  const content = document.getElementById("content");
  content.innerHTML = `<div class="placeholder">Loading…</div>`;

  const snap = await loadDetail(state.clientId, id);
  state.selected = snap;
  renderDetail(snap, theme);
}

// ── Snapshot history row ──────────────────────────────────────────────────────

function buildHistoryRow(currentSnap) {
  const history = state.allSnapshots
    .filter(s => s.system_sid === currentSnap.system_sid)
    .sort((a, b) => new Date(b.collected_at) - new Date(a.collected_at));
  if (history.length <= 1) return '';

  const chips = history.slice(0, 10).map(s => {
    if (s.id === currentSnap.id) {
      return `<button class="history-item active" data-snap-id="${esc(s.id)}" title="${fmtDate(s.collected_at)}">${fmtDateShort(s.collected_at)}</button>`;
    }
    return `
      <span class="history-chip">
        <button class="history-item" data-snap-id="${esc(s.id)}" title="${fmtDate(s.collected_at)}">${fmtDateShort(s.collected_at)}</button>
        <button class="diff-btn" data-snap-id="${esc(s.id)}" title="Comparer avec le snapshot actuel">↔</button>
      </span>`;
  }).join('');
  const more = history.length > 10
    ? `<span class="history-more">+${history.length - 10}</span>` : '';
  return `
    <div class="history-row">
      <span class="history-label">Historique</span>
      ${chips}${more}
    </div>`;
}

function initHistoryRow(container, currentSid) {
  container.querySelectorAll('.history-item').forEach(btn => {
    if (btn.classList.contains('active')) return;
    btn.addEventListener('click', () => {
      const id    = btn.dataset.snapId;
      const theme = sidTheme(currentSid);
      applyTheme(theme);
      const sidebarEl = document.querySelector(`.system-item[data-id="${id}"]`);
      if (sidebarEl) {
        document.querySelectorAll('.system-item').forEach(i => i.classList.remove('active'));
        sidebarEl.classList.add('active');
      }
      const content = document.getElementById('content');
      content.innerHTML = `<div class="placeholder">Loading…</div>`;
      loadDetail(state.clientId, id).then(snap => {
        state.selected = snap;
        renderDetail(snap, theme);
      }).catch(err => {
        content.innerHTML = `<div class="placeholder" style="color:#f87171">${esc(err.message)}</div>`;
      });
    });

    // Diff button
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!state.selected) return;
      triggerDiff(state.selected.id, btn.dataset.snapId, currentSid);
    });
  });

  // Wire diff buttons in the row
  container.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.selected) return;
      triggerDiff(state.selected.id, btn.dataset.snapId, currentSid);
    });
  });
}

async function triggerDiff(snapIdA, snapIdB, sid) {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="placeholder">Calcul du diff…</div>`;
  try {
    const diff = await loadDiff(state.clientId, snapIdA, snapIdB);
    renderDiff(diff, sid);
  } catch (err) {
    content.innerHTML = `<div class="placeholder" style="color:#f87171">${esc(err.message)}</div>`;
  }
}

function renderDiff(diff, sid) {
  const theme   = sidTheme(sid);
  const dateA   = fmtDateShort(diff.snap_a.collected_at);
  const dateB   = fmtDateShort(diff.snap_b.collected_at);
  const content = document.getElementById('content');

  const noChanges =
    !diff.system_changes.length &&
    !diff.components.added.length && !diff.components.removed.length && !diff.components.changed.length &&
    !diff.support_packages.added.length && !diff.support_packages.removed.length && !diff.support_packages.changed.length &&
    !diff.custom_objects.total_delta;

  const sysRows = diff.system_changes.map(c => `
    <tr>
      <td class="hi">${esc(c.label)}</td>
      <td class="diff-old">${esc(c.old || '—')}</td>
      <td class="diff-new">${esc(c.new || '—')}</td>
    </tr>`).join('');

  const compChangedRows = diff.components.changed.map(c => `
    <tr>
      <td class="hi">${esc(c.component)}</td>
      <td class="diff-old">SP ${esc(c.extrelease.old)}</td>
      <td class="diff-new">SP ${esc(c.extrelease.new)}</td>
    </tr>`).join('');

  const compAddedRows = diff.components.added.map(c =>
    `<tr><td class="diff-added" colspan="3">+ ${esc(c.component)} ${esc(c.release)} SP ${esc(c.extrelease||'?')}</td></tr>`
  ).join('');

  const compRemovedRows = diff.components.removed.map(c =>
    `<tr><td class="diff-removed" colspan="3">− ${esc(c.component)} ${esc(c.release)}</td></tr>`
  ).join('');

  const spChangedRows = diff.support_packages.changed.map(s => `
    <tr>
      <td class="hi">${esc(s.component)}</td>
      <td class="diff-old">${esc(s.patch.old)}</td>
      <td class="diff-new">${esc(s.patch.new)}</td>
    </tr>`).join('');

  const spAddedRows = diff.support_packages.added.map(s =>
    `<tr><td class="diff-added" colspan="3">+ ${esc(s.component)} ${esc(s.patch)}</td></tr>`
  ).join('');

  const spRemovedRows = diff.support_packages.removed.map(s =>
    `<tr><td class="diff-removed" colspan="3">− ${esc(s.component)} ${esc(s.patch)}</td></tr>`
  ).join('');

  const coRows = Object.entries(diff.custom_objects.by_type_delta)
    .map(([t, d]) => `
      <tr>
        <td class="hi">${esc(t)}</td>
        <td class="${d > 0 ? 'diff-added' : 'diff-removed'}">${d > 0 ? '+' : ''}${d}</td>
      </tr>`).join('');

  const totalDelta = diff.custom_objects.total_delta;
  const totalClass = totalDelta > 0 ? 'diff-added' : totalDelta < 0 ? 'diff-removed' : '';

  content.innerHTML = `
    <div class="diff-view">

      <div class="diff-header">
        <div class="diff-header-sid" style="color:${theme.color}">${esc(diff.snap_a.system_sid)}</div>
        <div class="diff-header-dates">
          <span class="diff-date-b">← ${dateB}</span>
          <span class="diff-arrow">↔</span>
          <span class="diff-date-a">${dateA} (actuel)</span>
        </div>
        <button class="diff-back-btn" id="diff-back">← Retour au détail</button>
      </div>

      ${noChanges ? `
        <div class="diff-no-change">
          <div style="font-size:24px;margin-bottom:8px">✓</div>
          Aucun changement détecté entre ces deux snapshots.
        </div>` : ''}

      ${diff.system_changes.length ? `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><span class="card-title">Système</span>
            <span class="card-badge diff-badge-changed">${diff.system_changes.length} modif.</span></div>
          <div class="card-body">
            <table class="data-table">
              <thead><tr><th>Champ</th><th>Avant (${dateB})</th><th>Après (${dateA})</th></tr></thead>
              <tbody>${sysRows}</tbody>
            </table>
          </div>
        </div>` : ''}

      ${(diff.components.changed.length + diff.components.added.length + diff.components.removed.length) ? `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><span class="card-title">Composants</span>
            <span class="card-badge diff-badge-changed">${diff.components.changed.length} modif.</span>
            ${diff.components.added.length   ? `<span class="card-badge diff-badge-added">+${diff.components.added.length}</span>` : ''}
            ${diff.components.removed.length ? `<span class="card-badge diff-badge-removed">−${diff.components.removed.length}</span>` : ''}
          </div>
          <div class="card-body">
            <table class="data-table">
              <thead><tr><th>Composant</th><th>Avant</th><th>Après</th></tr></thead>
              <tbody>${compChangedRows}${compAddedRows}${compRemovedRows}</tbody>
            </table>
          </div>
        </div>` : ''}

      ${(diff.support_packages.changed.length + diff.support_packages.added.length + diff.support_packages.removed.length) ? `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><span class="card-title">Support Packages</span>
            <span class="card-badge diff-badge-changed">${diff.support_packages.changed.length} modif.</span>
            ${diff.support_packages.added.length   ? `<span class="card-badge diff-badge-added">+${diff.support_packages.added.length}</span>` : ''}
            ${diff.support_packages.removed.length ? `<span class="card-badge diff-badge-removed">−${diff.support_packages.removed.length}</span>` : ''}
          </div>
          <div class="card-body">
            <table class="data-table">
              <thead><tr><th>Composant</th><th>Avant</th><th>Après</th></tr></thead>
              <tbody>${spChangedRows}${spAddedRows}${spRemovedRows}</tbody>
            </table>
          </div>
        </div>` : ''}

      ${(totalDelta || coRows) ? `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <span class="card-title">Custom Development</span>
            <span class="card-badge ${totalClass}">${totalDelta > 0 ? '+' : ''}${totalDelta} objets</span>
          </div>
          <div class="card-body">
            ${coRows ? `<table class="data-table">
              <thead><tr><th>Type</th><th>Delta</th></tr></thead>
              <tbody>${coRows}</tbody>
            </table>` : ''}
          </div>
        </div>` : ''}

    </div>`;

  document.getElementById('diff-back').addEventListener('click', () => {
    if (state.selected) renderDetail(state.selected, sidTheme(sid));
  });
}

// ── PDF print view ─────────────────────────────────────────────────────────────

function openPrintView(snap, analysis) {
  const sys = snap.payload?.system || {};
  const co  = snap.payload?.custom_objects || {};
  const comps = snap.payload?.components || [];
  const sps   = snap.payload?.support_packages || [];

  const compRows = [...comps]
    .sort((a, b) => (a.component || '').localeCompare(b.component || ''))
    .slice(0, 40)
    .map(c => `<tr><td>${esc(c.component||'')}</td><td>${esc(c.release||'')}</td><td>SP ${esc(c.extrelease||'?')}</td><td>${esc(c.description||'—')}</td></tr>`)
    .join('');

  const spRows = [...sps]
    .sort((a, b) => (a.component||'').localeCompare(b.component||'') || (b.applied||'').localeCompare(a.applied||''))
    .slice(0, 50)
    .map(r => `<tr><td>${esc(r.component||'')}</td><td>${esc(r.patch||'')}</td><td>${esc(r.type||'—')}</td><td>${fmtSAPDate(r.applied||'')}</td></tr>`)
    .join('');

  const analysisHtml = analysis ? mdToHtml(analysis.content) : '<p><em>Aucune analyse générée.</em></p>';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>SAPscope — ${esc(sys.rfcsysid||'?')} — ${fmtDateShort(snap.collected_at)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11pt;color:#111;background:#fff;padding:18mm 20mm}
  .logo{font-family:monospace;font-size:20pt;font-weight:700;color:#4f46e5;letter-spacing:-1px}
  .logo span{font-weight:400;color:#7c3aed}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #4f46e5;padding-bottom:10px;margin-bottom:18px}
  .header-right{text-align:right;font-size:9pt;color:#666}
  .sys-title{font-size:22pt;font-weight:700;font-family:monospace;color:#1e1b4b;margin-bottom:2px}
  .sys-host{font-size:11pt;color:#555}
  .info-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 16px;background:#f8f7ff;border:1px solid #e0e0f0;border-radius:6px;padding:12px;margin-bottom:18px}
  .info-cell .lbl{font-size:8pt;color:#888;text-transform:uppercase;letter-spacing:.5px}
  .info-cell .val{font-size:10pt;font-weight:600;color:#111;font-family:monospace}
  h2{font-size:13pt;font-weight:700;color:#1e1b4b;border-bottom:1px solid #ddd;padding-bottom:4px;margin:18px 0 10px}
  h3{font-size:11pt;font-weight:700;color:#4f46e5;margin:12px 0 5px}
  h4{font-size:10pt;font-weight:700;color:#333;margin:10px 0 4px}
  p,li{font-size:10pt;line-height:1.55;color:#222;margin-bottom:4px}
  ul{padding-left:20px;margin-bottom:6px}
  strong{color:#1e1b4b}
  table{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:12px}
  th{background:#f0efff;color:#1e1b4b;text-align:left;padding:5px 8px;font-weight:600;border-bottom:2px solid #c7c5f0}
  td{padding:4px 8px;border-bottom:1px solid #eee}
  tr:nth-child(even) td{background:#faf9ff}
  .meta-footer{margin-top:24px;padding-top:10px;border-top:1px solid #ddd;font-size:8pt;color:#999;display:flex;justify-content:space-between}
  @media print{body{padding:0} @page{margin:18mm 20mm}}
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">SAP<span>scope</span></div>
    <div style="font-size:9pt;color:#888;margin-top:2px">SAP Landscape Intelligence</div>
  </div>
  <div class="header-right">
    Généré le ${new Date().toISOString().slice(0,10)}<br>
    ${analysis ? `${esc(analysis.model)} · ${(analysis.input_tokens+analysis.output_tokens).toLocaleString()} tokens` : ''}
  </div>
</div>

<div class="sys-title">${esc(sys.rfcsysid||'?')}</div>
<div class="sys-host">${esc(sys.rfchost||'—')}</div>
<div class="info-grid" style="margin-top:10px">
  <div class="info-cell"><div class="lbl">SAP Release</div><div class="val">${esc(sys.rfcsaprl||'?')}</div></div>
  <div class="info-cell"><div class="lbl">Kernel</div><div class="val">${esc(sys.rfckernrl||'?')}</div></div>
  <div class="info-cell"><div class="lbl">OS</div><div class="val">${esc(sys.rfcopsys||'?')}</div></div>
  <div class="info-cell"><div class="lbl">Base de données</div><div class="val">${esc(sys.rfcdbsys||'?')}</div></div>
  <div class="info-cell"><div class="lbl">DB Host</div><div class="val">${esc(sys.rfcdbhost||'—')}</div></div>
  <div class="info-cell"><div class="lbl">Composants</div><div class="val">${comps.length}</div></div>
  <div class="info-cell"><div class="lbl">Support Packages</div><div class="val">${sps.length}</div></div>
  <div class="info-cell"><div class="lbl">Objets Z/Y</div><div class="val">${(co.total||0).toLocaleString()}</div></div>
</div>

<h2>Analyse Claude AI</h2>
<div class="analysis-body">${analysisHtml}</div>

${comps.length ? `<h2>Composants installés</h2>
<table><thead><tr><th>Composant</th><th>Release</th><th>SP Level</th><th>Description</th></tr></thead>
<tbody>${compRows}</tbody></table>` : ''}

${sps.length ? `<h2>Support Packages</h2>
<table><thead><tr><th>Composant</th><th>Patch</th><th>Type</th><th>Appliqué le</th></tr></thead>
<tbody>${spRows}</tbody></table>` : ''}

<div class="meta-footer">
  <span>SAPscope — Rapport généré automatiquement</span>
  <span>Snapshot du ${fmtDate(snap.collected_at)}</span>
</div>
<script>window.onload = () => { window.print(); };<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('Autorisez les popups pour ce site afin d\'exporter en PDF.'); return; }
  win.document.write(html);
  win.document.close();
}

// ── Render: detail view ────────────────────────────────────────────────────────

function renderDetail(snap, theme) {
  const p   = snap.payload;
  const sys = p.system || {};
  const co  = p.custom_objects || {};
  const content = document.getElementById("content");

  const spAge    = spFreshnessClass(p.support_packages);
  const dbKey    = classifyDb(sys.rfcdbsys);
  const dbMeta   = DB_THEMES[dbKey];
  const historyHtml = buildHistoryRow(snap);

  content.innerHTML = `

    <!-- Hero header -->
    <div class="sys-hero">
      <div class="sys-hero-banner">
        <div class="sys-hero-sid">${esc(sys.rfcsysid || '?')}</div>
        <div class="sys-hero-info">
          <div class="sys-hero-host">${esc(sys.rfchost || '—')}</div>
          <div class="sys-hero-tags">
            <span class="tag accent">${esc(sys.rfcsaprl || '?')}</span>
            <span class="tag">${esc(sys.rfcopsys || '—')}</span>
            ${dbKey !== 'none' ? `<span class="tag tag-db" style="color:${dbMeta.color};border-color:${dbMeta.color}55;background:${dbMeta.dim}">${esc(dbMeta.label)}</span>` : ''}
            <span class="tag">Kernel ${esc(sys.rfckernrl || '?')}</span>
          </div>
        </div>
      </div>
      <div class="sys-hero-kv">
        ${kvcell("DB Host",   sys.rfcdbhost   || '—')}
        ${kvcell("Collected", fmtDate(snap.collected_at))}
        ${kvcell("Received",  fmtDate(snap.received_at))}
        ${kvcell("Schema",    snap.schema_version || '—')}
      </div>
    </div>

    ${historyHtml}

    <!-- Stats row -->
    <div class="stats-row">
      ${statCard("Components",       p.components.length,              "")}
      ${statCard("Support Packages", p.support_packages.length,        "")}
      ${statCard("Custom Objects",   (co.total || 0).toLocaleString(), "Z/Y objects")}
      ${spAge.label === 'N/A' && dbKey !== 'none'
        ? statCard("Base de données", dbMeta.label, sys.rfcdbsys || '', dbMeta.color)
        : statCard("SP Freshness",    spAge.label,  spAge.sub,          spAge.dim)}
    </div>

    <!-- AI Analysis -->
    <div class="card card--ai" id="analysis-section">
      <div class="card-header card-header--ai">
        <div class="ai-header-left">
          <span class="ai-spark">✦</span>
          <div>
            <div class="card-title card-title--ai">Claude AI Analysis</div>
            <div class="ai-tagline">Automated SAP landscape assessment</div>
          </div>
        </div>
        <div class="analysis-toolbar">
          <select id="lang-select" class="lang-select">
            <option value="English">EN</option>
            <option value="French">FR</option>
            <option value="German">DE</option>
            <option value="Spanish">ES</option>
            <option value="Portuguese">PT</option>
          </select>
          <button class="analyse-btn analyse-btn--primary" id="analyse-btn">✦ Analyse</button>
          <button class="pdf-btn" id="pdf-btn" style="display:none" title="Exporter en PDF">↓ PDF</button>
          <span class="analysis-meta" id="analysis-meta"></span>
        </div>
      </div>
      <div class="card-body">
        <div id="analysis-content">
          <div class="analysis-placeholder">Cliquez sur Analyse pour générer un rapport Claude sur ce système.</div>
        </div>
      </div>
    </div>

    <!-- Custom objects (collapsible) -->
    <div class="card collapsible-card">
      <div class="card-header card-toggle">
        <span class="toggle-arrow">›</span>
        <span class="card-title">Custom Development</span>
        <span class="card-badge">${(co.total || 0).toLocaleString()} objects</span>
      </div>
      <div class="card-collapsible-body" style="display:none">
        <div class="card-body">
          ${renderCustomObjects(co)}
        </div>
      </div>
    </div>

    <!-- Components (collapsible + searchable) -->
    <div class="card collapsible-card">
      <div class="card-header card-toggle">
        <span class="toggle-arrow">›</span>
        <span class="card-title">Installed Components</span>
        <span class="card-badge">${p.components.length}</span>
      </div>
      <div class="card-collapsible-body" style="display:none">
        <div class="section-search">
          <input type="search" class="section-filter-input"
                 data-table="tbl-comp" data-count="count-comp"
                 placeholder="Filtrer les composants…" autocomplete="off">
          <span class="filter-count" id="count-comp"></span>
        </div>
        <div class="section-table-wrap">
          ${tableComponents(p.components, 'tbl-comp')}
        </div>
      </div>
    </div>

    <!-- Support Packages (collapsible + searchable) -->
    <div class="card collapsible-card">
      <div class="card-header card-toggle">
        <span class="toggle-arrow">›</span>
        <span class="card-title">Support Packages</span>
        <span class="card-badge">${p.support_packages.length}</span>
      </div>
      <div class="card-collapsible-body" style="display:none">
        <div class="section-search">
          <input type="search" class="section-filter-input"
                 data-table="tbl-sp" data-count="count-sp"
                 placeholder="Filtrer les support packages…" autocomplete="off">
          <span class="filter-count" id="count-sp"></span>
        </div>
        <div class="section-table-wrap">
          ${tableSP(p.support_packages, 'tbl-sp')}
        </div>
      </div>
    </div>`;

  // Animate bars + init interactivity after DOM insertion
  requestAnimationFrame(() => {
    animateBars();
    initDonutChart(content);
    initCollapsibles(content);
    initFilters(content);
    initHistoryRow(content, snap.system_sid);
  });

  // Set saved language
  const langSel = document.getElementById("lang-select");
  if (langSel) {
    langSel.value = state.lang;
    langSel.addEventListener("change", (e) => {
      state.lang = e.target.value;
      localStorage.setItem("sapscope_lang", e.target.value);
    });
  }

  // Load cached analysis
  loadAnalysis(state.clientId, snap.id)
    .then(a => renderAnalysis(a))
    .catch(() => {});

  document.getElementById("analyse-btn").addEventListener("click", async (e) => {
    const btn  = e.currentTarget;
    const lang = document.getElementById("lang-select")?.value || state.lang;
    btn.disabled = true;
    btn.textContent = "Running…";
    document.getElementById("analysis-content").innerHTML =
      `<div class="analysis-placeholder">Calling Claude…</div>`;
    try {
      const a = await requestAnalysis(state.clientId, snap.id, true, lang);
      renderAnalysis(a);
    } catch (err) {
      console.error("[sapscope] analysis error:", err);
      document.getElementById("analysis-content").innerHTML =
        `<div class="analysis-placeholder" style="color:#f87171">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "✦ Re-analyse";
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
  if (btn) btn.textContent = "✦ Re-analyse";
  // Pre-select the language the analysis was generated in
  if (a.language) {
    const langSel = document.getElementById("lang-select");
    if (langSel) langSel.value = a.language;
  }
  // Show PDF button
  const pdfBtn = document.getElementById("pdf-btn");
  if (pdfBtn) {
    pdfBtn.style.display = "";
    pdfBtn.onclick = () => openPrintView(state.selected, a);
  }
}

// ── Custom objects: donut chart + gradient bars ───────────────────────────────

function renderCustomObjects(co) {
  const byType = co.by_type || {};
  const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="analysis-placeholder">No custom objects.</div>`;

  const donut = buildDonut(entries, co.total || 0);
  const top = entries.slice(0, 12);
  const maxVal = top[0][1];

  const bars = top.map(([type, count], i) => {
    const pct = Math.round((count / maxVal) * 100);
    const color = CHART_COLORS[i % CHART_COLORS.length];
    return `
      <div class="obj-bar-row">
        <span class="obj-type-lbl">${esc(type)}</span>
        <div class="obj-bar-track">
          <div class="obj-bar-fill" data-pct="${pct}"
               style="width:0%;background:linear-gradient(90deg,${color},${color}88)">
          </div>
        </div>
        <span class="obj-count">${count.toLocaleString()}</span>
      </div>`;
  }).join("");

  const legend = entries.slice(0, 8).map(([type], i) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
      <span>${esc(type)}</span>
    </div>`).join("");

  return `
    <div class="obj-layout">
      <div class="obj-donut-wrap">
        ${donut}
        <div class="donut-legend">${legend}</div>
      </div>
      <div class="obj-bars-list">${bars}</div>
    </div>`;
}

function buildDonut(entries, total) {
  const size = 160, cx = 80, cy = 80, r = 56, stroke = 20;
  if (!total) return '';

  const top8  = entries.slice(0, 8);
  const other = entries.slice(8).reduce((s, [, v]) => s + v, 0);
  const data  = [...top8];
  if (other > 0) data.push(['Other', other]);

  let cumAngle = -90;
  const arcs = data.map(([type, val], i) => {
    const angle = (val / total) * 360;
    const path  = arcPath(cx, cy, r, cumAngle, cumAngle + angle - 0.5);
    const color = i < 8 ? CHART_COLORS[i] : '#334155';
    cumAngle += angle;
    return `<path class="donut-arc" d="${path}" fill="none" stroke="${color}"
      stroke-width="${stroke}" stroke-linecap="butt"
      data-label="${esc(type)}" data-val="${val.toLocaleString()}" data-color="${color}">
      <title>${esc(type)}: ${val.toLocaleString()}</title>
    </path>`;
  }).join('');

  return `
    <svg class="donut-svg" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1e1e42" stroke-width="${stroke}"/>
      ${arcs}
      <text class="donut-center-val" x="${cx}" y="${cy - 8}" text-anchor="middle" fill="#e2e4f0"
            font-size="18" font-weight="700" font-family="JetBrains Mono,monospace">
        ${fmtCompact(total)}
      </text>
      <text class="donut-center-lbl" x="${cx}" y="${cy + 10}" text-anchor="middle" fill="#454665"
            font-size="9" font-family="Inter,sans-serif" letter-spacing="1">
        OBJECTS
      </text>
    </svg>`;
}

function initDonutChart(container) {
  const svg = container.querySelector('.donut-svg');
  if (!svg) return;
  const valEl = svg.querySelector('.donut-center-val');
  const lblEl = svg.querySelector('.donut-center-lbl');
  if (!valEl || !lblEl) return;
  const origVal = valEl.textContent;
  const origLbl = lblEl.textContent;

  svg.querySelectorAll('.donut-arc').forEach(arc => {
    arc.addEventListener('mouseenter', () => {
      valEl.textContent = arc.dataset.val;
      lblEl.textContent = arc.dataset.label;
      lblEl.setAttribute('fill', arc.dataset.color);
      arc.setAttribute('stroke-width', '26');
    });
    arc.addEventListener('mouseleave', () => {
      valEl.textContent = origVal;
      lblEl.textContent = origLbl;
      lblEl.setAttribute('fill', '#454665');
      arc.setAttribute('stroke-width', '20');
    });
  });
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const s = degToXY(cx, cy, r, startDeg);
  const e = degToXY(cx, cy, r, endDeg);
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

function degToXY(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180;
  return { x: +(cx + r * Math.cos(rad)).toFixed(3), y: +(cy + r * Math.sin(rad)).toFixed(3) };
}

function animateBars() {
  document.querySelectorAll('.obj-bar-fill[data-pct]').forEach(el => {
    el.style.width = el.dataset.pct + '%';
  });
}

// ── Collapsible sections ──────────────────────────────────────────────────────

function initCollapsibles(container) {
  container.querySelectorAll('.card-toggle').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.section-filter-input')) return;
      const card  = header.closest('.collapsible-card');
      const body  = card.querySelector('.card-collapsible-body');
      const arrow = header.querySelector('.toggle-arrow');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : '';
      arrow.classList.toggle('open', !isOpen);
    });
  });
}

function initFilters(container) {
  container.querySelectorAll('.section-filter-input').forEach(input => {
    input.addEventListener('input', () => {
      const q       = input.value.toLowerCase().trim();
      const tableId = input.dataset.table;
      const countId = input.dataset.count;
      const table   = container.querySelector(`#${tableId}`);
      if (!table) return;
      const rows = table.querySelectorAll('tbody tr');
      let visible = 0;
      rows.forEach(row => {
        const match = !q || (row.dataset.search || '').includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      if (countId) {
        const countEl = container.querySelector(`#${countId}`);
        if (countEl) countEl.textContent = q ? `${visible} / ${rows.length}` : '';
      }
    });
  });
}

// ── Components table ───────────────────────────────────────────────────────────

function tableComponents(rows, tableId = 'tbl-comp') {
  if (!rows.length) return `<div class="analysis-placeholder">No data.</div>`;
  const sorted = [...rows].sort((a, b) => a.component.localeCompare(b.component));
  const body = sorted.map(r => {
    const search = `${r.component} ${r.release} ${r.extrelease || ''} ${r.description || ''}`.toLowerCase();
    return `<tr data-search="${esc(search)}">
    <td class="hi">${esc(r.component)}</td>
    <td><span class="badge badge-release">${esc(r.release)}</span></td>
    <td><span class="badge badge-sp">SP ${esc(r.extrelease || '?')}</span></td>
    <td class="dim">${esc(r.description || '—')}</td>
  </tr>`;
  }).join("");
  return `<table class="data-table" id="${tableId}">
    <thead><tr><th>Component</th><th>Release</th><th>SP Level</th><th>Description</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

// ── Support packages table ─────────────────────────────────────────────────────

function tableSP(rows, tableId = 'tbl-sp') {
  if (!rows.length) return `<div class="analysis-placeholder">No data.</div>`;
  const sorted = [...rows].sort((a, b) =>
    a.component.localeCompare(b.component) || b.applied.localeCompare(a.applied));
  const body = sorted.map(r => {
    const search = `${r.component} ${r.patch} ${r.type || ''} ${r.applied}`.toLowerCase();
    const cls = spDateClass(r.applied);
    return `<tr data-search="${esc(search)}">
      <td class="hi">${esc(r.component)}</td>
      <td><span class="badge badge-patch">${esc(r.patch)}</span></td>
      <td class="dim">${esc(r.type || '—')}</td>
      <td><span class="badge ${cls}">${fmtSAPDate(r.applied)}</span></td>
    </tr>`;
  }).join("");
  return `<table class="data-table" id="${tableId}">
    <thead><tr><th>Component</th><th>Patch</th><th>Type</th><th>Applied</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function kvcell(label, value, accent = false) {
  return `<div class="kv-cell">
    <div class="k">${esc(label)}</div>
    <div class="v${accent ? ' hi' : ''}">${esc(value)}</div>
  </div>`;
}

function statCard(label, value, sub, dimColor = null) {
  const style = dimColor ? `style="color:${dimColor}"` : '';
  return `<div class="stat-card">
    <div class="label">${esc(label)}</div>
    <div class="value" ${style}>${esc(String(value))}</div>
    ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
  </div>`;
}

function spFreshnessClass(sps) {
  if (!sps || !sps.length) return { label: 'N/A', sub: '', dim: null };
  const sorted = [...sps].sort((a, b) => b.applied.localeCompare(a.applied));
  const latest = sorted[0].applied;
  const months = monthsAgo(latest);
  if (months < 6)  return { label: 'Fresh',   sub: `latest: ${fmtSAPDate(latest)}`, dim: '#34d399' };
  if (months < 12) return { label: 'Aging',   sub: `latest: ${fmtSAPDate(latest)}`, dim: '#fbbf24' };
  return               { label: 'Outdated', sub: `latest: ${fmtSAPDate(latest)}`, dim: '#f87171' };
}

function spDateClass(applied) {
  const months = monthsAgo(applied);
  if (months < 6)  return 'badge-patch';
  if (months < 12) return 'badge-stale';
  return 'badge-old';
}

function monthsAgo(sapDate) {
  if (!sapDate || sapDate.length !== 8) return 999;
  const y = +sapDate.slice(0,4), m = +sapDate.slice(4,6), d = +sapDate.slice(6,8);
  const then = new Date(y, m-1, d);
  return (Date.now() - then.getTime()) / (1000 * 60 * 60 * 24 * 30);
}

function fmtCompact(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const out   = [];
  let inUl    = false;
  for (const raw of lines) {
    const line = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if (/^## (.+)$/.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      out.push(`<h3>${line.slice(3)}</h3>`);
    } else if (/^### (.+)$/.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      out.push(`<h4>${line.slice(4)}</h4>`);
    } else if (/^- (.+)$/.test(line)) {
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${line.slice(2).replace(/\*\*(.{1,200}?)\*\*/g,'<strong>$1</strong>')}</li>`);
    } else if (line.trim() === '') {
      if (inUl) { out.push('</ul>'); inUl = false; }
    } else {
      if (inUl) { out.push('</ul>'); inUl = false; }
      out.push(`<p>${line.replace(/\*\*(.{1,200}?)\*\*/g,'<strong>$1</strong>')}</p>`);
    }
  }
  if (inUl) out.push('</ul>');
  return out.join('\n');
}

function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toISOString().replace("T"," ").slice(0,16) + " UTC";
}

function fmtDateShort(iso) {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

function fmtSAPDate(s) {
  if (!s || s.length !== 8) return s || "—";
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function setStatus(ok) {
  document.getElementById("status-dot").className = ok ? "ok" : "err";
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function _applySession(data) {
  state.token   = data.token;
  state.isAdmin = data.is_admin || false;
  sessionStorage.setItem("sapscope_token",    data.token);
  sessionStorage.setItem("sapscope_is_admin", state.isAdmin ? "1" : "0");
  if (state.isAdmin) document.getElementById("admin-btn").style.display = "";
  setStatus(true);
  showAppScreen();
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById("login-error");
  const btn   = document.getElementById("login-btn");
  errEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Connexion…";
  try {
    const data = await apiLogin(
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-pass").value,
    );
    _applySession(data);
    await initApp();
  } catch (err) {
    console.error("[sapscope] login error:", err);
    errEl.textContent = err.message;
    setStatus(false);
  } finally {
    btn.disabled = false;
    btn.textContent = "Connexion →";
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

async function handleRegister(e) {
  e.preventDefault();
  const errEl = document.getElementById("reg-error");
  const btn   = document.getElementById("reg-btn");
  errEl.textContent = "";

  const email  = document.getElementById("reg-email").value.trim();
  const pass   = document.getElementById("reg-pass").value;
  const pass2  = document.getElementById("reg-pass2").value;

  if (pass !== pass2) {
    errEl.textContent = "Les mots de passe ne correspondent pas.";
    return;
  }
  if (pass.length < 12) {
    errEl.textContent = "Le mot de passe doit faire au moins 12 caractères.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Création…";
  try {
    const data = await apiRegister(email, pass);
    _applySession(data);
    await initApp();
  } catch (err) {
    console.error("[sapscope] register error:", err);
    errEl.textContent = err.message === "Self-registration is disabled on this instance"
      ? "L'inscription n'est pas activée sur cette instance. Contactez votre administrateur."
      : err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Créer mon compte →";
  }
}

// ── App init ──────────────────────────────────────────────────────────────────

async function initApp() {
  try {
    const clients = await loadClients();
    if (!clients.length) {
      renderClientSelector([]);
      renderOnboarding("no-clients");
      return;
    }
    renderClientSelector(clients);
    await loadAndRenderSnapshots();
  } catch (err) {
    console.error("[sapscope] init error:", err);
    document.getElementById("content").innerHTML =
      `<div class="placeholder" style="color:#f87171">${esc(err.message)}</div>`;
  }
}

function renderOnboarding(reason) {
  const content = document.getElementById("content");
  const origin  = window.location.origin;

  if (reason === "no-clients" && !state.isAdmin) {
    content.innerHTML = `
      <div class="onboarding">
        <div class="onboarding-title">Compte créé</div>
        <div class="onboarding-text">
          Votre compte est prêt. Pour connecter votre premier système SAP,
          écrivez-nous à <a href="mailto:contact@luku.fr" style="color:var(--accent)">contact@luku.fr</a>
          en indiquant votre adresse email — nous vous configurons votre périmètre et vous guidons pour l'installation de l'agent.
        </div>
      </div>`;
    return;
  }

  // Admin — guide complet
  const step = (n, title, body) => `
    <div class="ob-step">
      <div class="ob-step-num">${n}</div>
      <div class="ob-step-body">
        <div class="ob-step-title">${title}</div>
        ${body}
      </div>
    </div>`;

  content.innerHTML = `
    <div class="onboarding">
      <div class="onboarding-title">Bienvenue sur SAPscope</div>
      <div class="onboarding-text">Suivez ces étapes pour connecter votre premier système SAP.</div>
      <div class="ob-steps">
        ${step(1, "Créez un client SAP dans le panel admin",
          `<button class="ob-btn" id="ob-open-admin">Ouvrir le panel admin ⚙</button>`)}
        ${step(2, "Générez un token agent pour ce client",
          `<p class="ob-hint">Dans le panel → onglet Clients → Générer token agent.<br>
           Copiez le token — il n'est affiché qu'une seule fois.</p>`)}
        ${step(3, "Installez l'agent sur le serveur SAP",
          `<p class="ob-hint">Connectez-vous en SSH sur le serveur d'application SAP, puis :</p>
           <div class="ob-code">
             curl -O ${esc(origin)}/dist/agent.tar.gz<br>
             tar xzf agent.tar.gz<br>
             sudo ./install.sh --token &lt;TOKEN&gt; --host &lt;SAP_HOST&gt; --sysnr 00 --client 100
           </div>
           <p class="ob-hint" style="margin-top:8px">L'agent collecte toutes les 6h. Les données apparaissent ici dans l'heure.</p>`)}
      </div>
    </div>`;

  document.getElementById("ob-open-admin")?.addEventListener("click", openAdminPanel);
}

// ── Overview — environment-tier diagram ──────────────────────────────────────

// Role classification (for chip color in "par rôle" mode)
const ROLE_RULES = [
  { role:'erp',    label:'ERP',          match: s => /^[DQPS][0-9A-Z]{1,2}$/.test(s) && !/^(BW|BI|ADS|SAR|RTR|SRM|GRC|PO[0-9])/i.test(s) },
  { role:'router', label:'SAProuter',    match: s => /RTR|ROUTER|SAR/i.test(s) },
  { role:'ads',    label:'Doc Services', match: s => /ADS|DOC/i.test(s) },
  { role:'bw',     label:'BW/Analytics', match: s => /BW|BI|DWH|BPC|BO/i.test(s) },
  { role:'po',     label:'Integration',  match: s => /^PO|XI|PI|CPI|CXI|INT/i.test(s) },
  { role:'srv',    label:'Services',     match: s => /SRM|GRC|CRM|SCM|SLT|MDG|GTS|WM|EWM|TM/i.test(s) },
];

// ── Database classification ───────────────────────────────────────────────────

const DB_THEMES = {
  hana:   { label:'SAP HANA',   color:'#fbbf24', dim:'#3d2a06', glow:'rgba(251,191,36,0.22)'  },
  oracle: { label:'Oracle',     color:'#f87171', dim:'#3d0a0a', glow:'rgba(248,113,113,0.22)' },
  mssql:  { label:'SQL Server', color:'#60a5fa', dim:'#1a2e50', glow:'rgba(96,165,250,0.22)'  },
  db2:    { label:'IBM DB2',    color:'#34d399', dim:'#052e20', glow:'rgba(52,211,153,0.22)'  },
  maxdb:  { label:'MaxDB',      color:'#a78bfa', dim:'#2d1b50', glow:'rgba(167,139,250,0.22)' },
  sybase: { label:'Sybase',     color:'#fb923c', dim:'#3d1508', glow:'rgba(251,146,60,0.22)'  },
  other:  { label:'Autre BDD',  color:'#94a3b8', dim:'#1e2533', glow:'rgba(148,163,184,0.15)' },
};

function classifyDb(dbsys) {
  if (!dbsys || !dbsys.trim()) return 'none';
  const d = dbsys.toUpperCase();
  if (d === 'HDB' || d.includes('HANA'))              return 'hana';
  if (d === 'ORA' || d.includes('ORACLE'))            return 'oracle';
  if (d === 'MSS' || d.includes('SQL'))               return 'mssql';
  if (d === 'DB6' || d === 'DB4' || d === 'DB7' || d.includes('DB2')) return 'db2';
  if (d === 'ADA' || d.includes('MAX') || d.includes('SAPDB')) return 'maxdb';
  if (d === 'SYB' || d.includes('SYBASE') || d.includes('ASE')) return 'sybase';
  return 'other';
}

// Role-based themes — each system type has a distinct color
const ROLE_THEMES = {
  erp:    { color:'#60a5fa', dim:'#1a2e50', glow:'rgba(96,165,250,0.22)'  },
  router: { color:'#38bdf8', dim:'#052030', glow:'rgba(56,189,248,0.22)'  },
  ads:    { color:'#e879f9', dim:'#2d0838', glow:'rgba(232,121,249,0.22)' },
  bw:     { color:'#f97316', dim:'#3d1200', glow:'rgba(249,115,22,0.22)'  },
  po:     { color:'#10b981', dim:'#022e1e', glow:'rgba(16,185,129,0.22)'  },
  srv:    { color:'#a78bfa', dim:'#2d1b50', glow:'rgba(167,139,250,0.22)' },
  other:  { color:'#94a3b8', dim:'#1e2533', glow:'rgba(148,163,184,0.15)' },
};

// Environment tier classification
const ENV_TIER_RULES = [
  { tier:'sandbox', match: s => /SBX|SND|FOR|TRN|TRAIN|PLAY/i.test(s) || /^S[0-9A-Z]{1,2}$/i.test(s) },
  { tier:'dev',     match: s => /^DEV$/i.test(s) || /^D[0-9A-Z]{1,2}$/i.test(s) },
  { tier:'qal',     match: s => /QAS|QAL|TST|TEST|UAT|VAL|REC/i.test(s) || /^Q[0-9A-Z]{1,2}$/i.test(s) },
  { tier:'preprod', match: s => /PREPROD|PPD|STG|STAGE/i.test(s) || /^PP[A-Z0-9]/i.test(s) },
  { tier:'pro',     match: s => /^PRD$|^PROD$/i.test(s) || (/^P[0-9A-Z]{1,2}$/i.test(s) && !/^PO$/i.test(s)) || /^EP[0-9]/i.test(s) },
];

// Tier display config
const ENV_TIER_DEFS = {
  sandbox: { label:'Sandbox',       color:'#22d3ee', dim:'#042830', glow:'rgba(34,211,238,0.18)'  },
  dev:     { label:'Développement', color:'#818cf8', dim:'#1a1a40', glow:'rgba(129,140,248,0.18)' },
  qal:     { label:'Qualité',       color:'#f59e0b', dim:'#3d2600', glow:'rgba(245,158,11,0.18)'  },
  preprod: { label:'Pré-prod',      color:'#fb923c', dim:'#3d1508', glow:'rgba(251,146,60,0.18)'  },
  pro:     { label:'Production',    color:'#f43f5e', dim:'#3d0a18', glow:'rgba(244,63,94,0.18)'   },
  other:   { label:'Infra / Svc',   color:'#64748b', dim:'#181e28', glow:'rgba(100,116,139,0.15)' },
};

const TIER_ORDER    = ['sandbox','dev','qal','preprod','pro','other'];
const LANDSCAPE_TIERS = ['sandbox','dev','qal','preprod','pro']; // no "Infra/Svc" bucket

// Hidden tiers (filter state) + selected chips for export
let hiddenTiers   = new Set();
let selectedSnaps = new Set(); // snapshot IDs checked for export

function classifyRole(sid) {
  for (const r of ROLE_RULES) if (r.match(sid)) return r.role;
  return 'other';
}

function classifyTier(sid, host = '') {
  const s = sid.toUpperCase();

  // 1. Règles SID exactes (patterns standard SAP : P01, D01, Q01…)
  for (const r of ENV_TIER_RULES) if (r.match(s)) return r.tier;

  // 2. Mot-clé d'environnement contenu dans le SID
  //    (ex : ADSPRD, SOLDEV, RTRPRD, SMDEV, SLDPRD…)
  //    Ordre important : PREPROD avant PROD pour éviter faux positifs (PPRD contient PRD)
  if (/SBX|SAND|TRN|TRAIN|PLAY/.test(s))   return 'sandbox';
  if (/PREPROD|PREPR|PPD|PPRD/.test(s))    return 'preprod';
  if (/PRD|PROD/.test(s))                  return 'pro';
  if (/QAS|QAL|TST|TEST|UAT|VAL/.test(s)) return 'qal';
  if (/DEV/.test(s))                       return 'dev';

  // 3. Fallback hostname — sans word-boundary pour matcher sapdevhst01, sapprdhst01…
  const h = host.toLowerCase();
  if (/preprod|ppd/.test(h))              return 'preprod';
  if (/prd|prod/.test(h))                return 'pro';
  if (/qas|qal|test|uat|qual/.test(h))   return 'qal';
  if (/dev/.test(h))                     return 'dev';
  if (/sbx|sand|train/.test(h))          return 'sandbox';

  return 'other';
}

function renderOverview(snapshots) {
  if (!snapshots.length) {
    document.getElementById('content').innerHTML = `<div class="placeholder">No snapshots yet.</div>`;
    return;
  }

  // Classify each snapshot — "other" falls back to "pro" (no Infra/Svc bucket)
  const tierGroups = {};
  for (const t of LANDSCAPE_TIERS) tierGroups[t] = [];
  for (const s of snapshots) {
    const role = classifyRole(s.system_sid);
    const raw  = classifyTier(s.system_sid, s.system_host || '');
    const tier = LANDSCAPE_TIERS.includes(raw) ? raw : 'pro';
    tierGroups[tier].push({ snap: s, role, tier });
  }
  for (const g of Object.values(tierGroups)) g.sort((a,b) => a.snap.system_sid.localeCompare(b.snap.system_sid));

  const presentTiers = LANDSCAPE_TIERS.filter(t => tierGroups[t].length > 0);

  // Env filter checkboxes
  const filterChecks = presentTiers.map(t => {
    const def     = ENV_TIER_DEFS[t];
    const checked = !hiddenTiers.has(t);
    const count   = tierGroups[t].length;
    return `<label class="ov-tier-check" style="--tc:${def.color}">
      <input type="checkbox" ${checked ? 'checked' : ''} data-tier="${t}">
      <span class="ov-check-box"></span>
      <span class="ov-check-dot"></span>
      <span class="ov-check-label">${esc(def.label)}</span>
      <span class="ov-check-count">${count}</span>
    </label>`;
  }).join('');

  // Selection count
  const visibleIds = presentTiers
    .filter(t => !hiddenTiers.has(t))
    .flatMap(t => tierGroups[t].map(i => i.snap.id));
  const selCount = visibleIds.filter(id => selectedSnaps.has(id)).length;

  // Tier rows (only visible + present tiers)
  const tiersHtml = presentTiers
    .filter(t => !hiddenTiers.has(t))
    .map(t => buildTierRow(t, tierGroups[t]))
    .join('');

  const content = document.getElementById('content');
  content.innerHTML = `
    <div id="overview-view">
      <div class="overview-toolbar">
        <div class="ov-filter-bar">${filterChecks}</div>
        <div class="ov-sel-bar">
          <button class="ov-sel-btn" id="ov-sel-all" title="Tout sélectionner">Tout</button>
          <button class="ov-sel-btn" id="ov-sel-none" title="Tout désélectionner">Aucun</button>
          <button class="ov-export-btn ${selCount === 0 ? 'hidden' : ''}" id="ov-export-btn">
            ↓ Exporter <span class="ov-export-count">${selCount}</span>
          </button>
        </div>
      </div>
      <svg id="conn-svg" aria-hidden="true"><defs></defs></svg>
      <div class="ov-canvas">${tiersHtml}</div>
    </div>`;

  // Wire env filter checkboxes
  content.querySelectorAll('.ov-tier-check input').forEach(cb => {
    cb.addEventListener('change', () => {
      const t = cb.dataset.tier;
      if (cb.checked) hiddenTiers.delete(t); else hiddenTiers.add(t);
      renderOverview(state.snapshots);
    });
  });

  // Wire selection buttons
  content.getElementById?.('ov-sel-all') || content.querySelector('#ov-sel-all');
  content.querySelector('#ov-sel-all').addEventListener('click', () => {
    visibleIds.forEach(id => selectedSnaps.add(id));
    renderOverview(state.snapshots);
  });
  content.querySelector('#ov-sel-none').addEventListener('click', () => {
    visibleIds.forEach(id => selectedSnaps.delete(id));
    renderOverview(state.snapshots);
  });
  const exportBtn = content.querySelector('#ov-export-btn');
  if (exportBtn) exportBtn.addEventListener('click', () => exportLandscape(snapshots));

  // Wire chip checkboxes (select for export)
  content.querySelectorAll('.chip-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      if (cb.checked) selectedSnaps.add(cb.dataset.id);
      else selectedSnaps.delete(cb.dataset.id);
      // Update export button live without full re-render
      const cnt = [...selectedSnaps].filter(id => visibleIds.includes(id)).length;
      const btn = content.querySelector('#ov-export-btn');
      if (btn) {
        btn.classList.toggle('hidden', cnt === 0);
        const span = btn.querySelector('.ov-export-count');
        if (span) span.textContent = cnt;
      }
    });
  });

  // Chip body click → navigate to detail (ignore clicks on checkbox)
  content.querySelectorAll('.sys-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (e.target.closest('.chip-sel')) return;
      const id    = chip.dataset.id;
      const el    = document.querySelector(`.system-item[data-id="${id}"]`);
      const role  = chip.dataset.role;
      const theme = ROLE_THEMES[role] || ROLE_THEMES.other;
      document.getElementById('overview-btn').classList.remove('active');
      applyTheme(theme);
      if (el) selectSnapshot(id, el, theme);
    });
  });

  requestAnimationFrame(() => requestAnimationFrame(() => redrawConnections()));
}

function exportLandscape(snapshots) {
  const rows = snapshots.filter(s => selectedSnaps.has(s.id));
  if (!rows.length) return;
  const header = ['SID', 'Hostname', 'Version SAP', 'Base de données', 'Environnement', 'Support Packages'];
  const lines = rows.map(s => {
    const raw   = classifyTier(s.system_sid, s.system_host || '');
    const tier  = LANDSCAPE_TIERS.includes(raw) ? raw : 'pro';
    const tLabel = ENV_TIER_DEFS[tier]?.label || tier;
    return [s.system_sid, s.system_host, s.system_release || '', s.db_type || '', tLabel, s.support_packages_count || 0]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const csv  = [header.join(','), ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'sapscope-landscape.csv'; a.click();
  URL.revokeObjectURL(url);
}

function buildTierRow(tier, items) {
  const def   = ENV_TIER_DEFS[tier];
  const chips = items.map(({ snap, role }) => buildChip(snap, role)).join('');
  return `
    <div class="ov-section" data-tier="${tier}"
         style="--sc:${def.color};--sc-dim:${def.dim};--sc-glow:${def.glow}">
      <div class="ov-section-hdr">
        <span class="ov-section-dot"></span>
        <span class="ov-section-label">${esc(def.label)}</span>
        <span class="ov-section-count">${items.length}</span>
      </div>
      <div class="ov-chips">${chips}</div>
    </div>`;
}

function buildChip(snap, role) {
  // Summary objects — use dedicated fields, not payload (not available in list endpoint)
  const dbKey   = classifyDb(snap.db_type);
  const db      = DB_THEMES[dbKey];
  const tier    = classifyTier(snap.system_sid, snap.system_host || '');
  const t       = ENV_TIER_DEFS[tier] || ENV_TIER_DEFS.other;
  const spCount = snap.support_packages_count || 0;
  const spLabel = spCount > 0 ? `${spCount} SP` : 'No SP';
  const spColor = spCount > 0 ? '#94a3b8' : '#475569';
  const isSelected = selectedSnaps.has(snap.id);
  return `
    <div class="sys-chip ${isSelected ? 'chip-selected' : ''}" data-id="${esc(snap.id)}" data-role="${role}"
         style="--cc:${t.color};--cc-dim:${t.dim};--cc-glow:${t.glow}"
         title="Cliquer pour ouvrir le détail">
      <label class="chip-sel" title="Sélectionner pour l'export" onclick="event.stopPropagation()">
        <input type="checkbox" class="chip-check" data-id="${esc(snap.id)}" ${isSelected ? 'checked' : ''}>
        <span class="chip-check-box"></span>
      </label>
      <div class="sys-chip-sid">${esc(snap.system_sid)}</div>
      <div class="sys-chip-host">${esc(snap.system_host)}</div>
      <div class="sys-chip-meta">
        ${snap.system_release ? `<span class="sys-chip-tag">${esc(snap.system_release)}</span>` : ''}
        ${dbKey !== 'none' ? `<span class="sys-chip-db" style="color:${db.color};border-color:${db.color}44">${esc(db.label)}</span>` : ''}
        <span class="sys-chip-tag" style="color:${spColor}">${esc(spLabel)}</span>
      </div>
    </div>`;
}

function redrawConnections() {
  const svg  = document.getElementById('conn-svg');
  const view = document.getElementById('overview-view');
  if (!svg || !view) return;

  svg.setAttribute('width',  view.offsetWidth);
  svg.setAttribute('height', view.offsetHeight);

  // Visible tier sections in DOM order
  const sections = [...view.querySelectorAll('.ov-section[data-tier]')];
  const defs = svg.querySelector('defs');
  svg.innerHTML = '';
  svg.appendChild(defs);

  if (sections.length < 2) return;

  const vr = view.getBoundingClientRect();
  const f  = n => n.toFixed(1);

  for (let i = 0; i < sections.length - 1; i++) {
    const a   = sections[i];
    const b   = sections[i + 1];
    const ar  = a.getBoundingClientRect();
    const br  = b.getBoundingClientRect();
    const color = ENV_TIER_DEFS[a.dataset.tier]?.color || '#64748b';

    // Center-bottom of a → center-top of b
    const x1 = ar.left + ar.width  * 0.5 - vr.left;
    const y1 = ar.bottom - vr.top;
    const x2 = br.left + br.width  * 0.5 - vr.left;
    const y2 = br.top   - vr.top;
    const gap = y2 - y1;
    const cy1 = y1 + gap * 0.4;
    const cy2 = y2 - gap * 0.4;

    svg.insertAdjacentHTML('beforeend', `
      <g opacity=".75">
        <path d="M${f(x1)} ${f(y1)} C${f(x1)} ${f(cy1)} ${f(x2)} ${f(cy2)} ${f(x2)} ${f(y2)}"
              fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 6" stroke-linecap="round"/>
        <circle cx="${f(x1)}" cy="${f(y1)}" r="3" fill="${color}"/>
        <polygon points="${f(x2-5)},${f(y2-9)} ${f(x2+5)},${f(y2-9)} ${f(x2)},${f(y2-1)}"
                 fill="${color}"/>
      </g>`);
  }
}

function buildMiniBar(sps) {
  if (!sps.length) return '';
  const sorted = [...sps].sort((a,b) => a.applied.localeCompare(b.applied)).slice(-8);
  const bars = sorted.map(sp => {
    const months = Math.min(monthsAgo(sp.applied), 24);
    const h  = Math.max(3, Math.round((1 - months/24) * 24));
    const col = months < 6 ? '#34d399' : months < 12 ? '#fbbf24' : '#f87171';
    return `<div style="width:5px;height:${h}px;background:${col};border-radius:2px;align-self:flex-end"></div>`;
  }).join('');
  return `<div style="display:flex;gap:2px;align-items:flex-end;height:24px" title="SP recency">${bars}</div>`;
}

// ── Admin panel ───────────────────────────────────────────────────────────────

async function openAdminPanel() {
  document.getElementById("admin-modal").style.display = "flex";
  const content = document.getElementById("admin-tab-content");
  content.innerHTML = `<div class="placeholder" style="padding:40px 0;font-size:11px">Loading…</div>`;
  try {
    const [users, clients] = await Promise.all([loadUsers(), loadAdminClients()]);
    _renderAdminTabs(users, clients, _activeAdminTab());
  } catch (err) {
    console.error("[sapscope] admin load error:", err);
    content.innerHTML = `<div class="placeholder" style="color:#f87171;padding:40px 0">${esc(err.message)}</div>`;
  }
}

function _activeAdminTab() {
  return document.querySelector('.admin-tab.active')?.dataset.tab || 'users';
}

function _renderAdminTabs(users, clients, activeTab) {
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
    btn.onclick = async () => {
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const [u, c] = await Promise.all([loadUsers(), loadAdminClients()]);
      if (btn.dataset.tab === 'users') _renderUsersTab(u, c);
      else _renderClientsTab(c, u);
    };
  });
  if (activeTab === 'users') _renderUsersTab(users, clients);
  else _renderClientsTab(clients, users);
}

function _renderUsersTab(users, clients) {
  const content = document.getElementById("admin-tab-content");
  content.innerHTML = `
    <div class="admin-section">
      <div class="admin-section-hdr">
        <span class="admin-section-title">Comptes consultants</span>
        <button id="new-user-btn" class="admin-action-btn">+ Nouveau</button>
      </div>
      <div id="new-user-form" class="admin-form" style="display:none">
        <input id="nu-email" type="email" placeholder="email" class="admin-input">
        <input id="nu-pass" type="password" placeholder="mot de passe (12+ car.)" class="admin-input">
        <label class="admin-check-label"><input id="nu-admin" type="checkbox"> Admin</label>
        <div style="display:flex;gap:8px">
          <button id="nu-submit" class="admin-submit-btn">Créer</button>
          <button id="nu-cancel" class="admin-cancel-btn">Annuler</button>
        </div>
        <div id="nu-error" class="admin-error"></div>
      </div>
      <div class="admin-list">
        ${users.map(u => _userRow(u, clients)).join('')}
      </div>
    </div>`;

  document.getElementById("new-user-btn").onclick = () => {
    document.getElementById("new-user-form").style.display = "flex";
    document.getElementById("new-user-btn").style.display = "none";
  };
  document.getElementById("nu-cancel").onclick = () => {
    document.getElementById("new-user-form").style.display = "none";
    document.getElementById("new-user-btn").style.display = "";
  };
  document.getElementById("nu-submit").onclick = async () => {
    const errEl = document.getElementById("nu-error");
    errEl.textContent = "";
    const pass = document.getElementById("nu-pass").value;
    if (pass.length < 12) {
      errEl.textContent = "Le mot de passe doit faire au moins 12 caractères.";
      return;
    }
    try {
      await createUser({
        email:    document.getElementById("nu-email").value.trim(),
        password: pass,
        is_admin: document.getElementById("nu-admin").checked,
      });
      const [u, c] = await Promise.all([loadUsers(), loadAdminClients()]);
      _renderAdminTabs(u, c, 'users');
    } catch (err) { errEl.textContent = err.message; }
  };

  content.querySelectorAll('.uc-toggle').forEach(btn => {
    btn.onclick = async () => {
      const { uid, cid, assigned } = btn.dataset;
      btn.disabled = true;
      try {
        if (assigned === 'true') await unassignClientFromUser(uid, cid);
        else await assignClientToUser(uid, cid);
        const [u, c] = await Promise.all([loadUsers(), loadAdminClients()]);
        _renderAdminTabs(u, c, 'users');
      } catch { btn.disabled = false; }
    };
  });
}

function _userRow(user, clients) {
  const assigned = new Set(user.client_ids || []);
  const chips = clients.map(c => {
    const on = assigned.has(c.id);
    return `<button class="uc-toggle ${on ? 'on' : ''}"
      data-uid="${esc(user.id)}" data-cid="${esc(c.id)}" data-assigned="${on}">
      ${esc(c.name)}</button>`;
  }).join('');
  return `
    <div class="admin-user-row">
      <div class="admin-user-meta">
        <span class="admin-user-email">${esc(user.email)}</span>
        ${user.is_admin ? '<span class="admin-badge">admin</span>' : ''}
      </div>
      <div class="admin-user-clients">${chips || '<span class="no-clients">aucun client</span>'}</div>
    </div>`;
}

function _renderClientsTab(clients, users) {
  const content = document.getElementById("admin-tab-content");
  content.innerHTML = `
    <div class="admin-section">
      <div class="admin-section-hdr">
        <span class="admin-section-title">Clients SAP</span>
        <button id="new-client-btn" class="admin-action-btn">+ Nouveau</button>
      </div>
      <div id="new-client-form" class="admin-form" style="display:none">
        <input id="nc-name" type="text" placeholder="Nom du client" class="admin-input">
        <div style="display:flex;gap:8px">
          <button id="nc-submit" class="admin-submit-btn">Créer</button>
          <button id="nc-cancel" class="admin-cancel-btn">Annuler</button>
        </div>
        <div id="nc-error" class="admin-error"></div>
      </div>
      <div class="admin-list">
        ${clients.map(c => _clientRow(c)).join('')}
      </div>
    </div>`;

  document.getElementById("new-client-btn").onclick = () => {
    document.getElementById("new-client-form").style.display = "flex";
    document.getElementById("new-client-btn").style.display = "none";
  };
  document.getElementById("nc-cancel").onclick = () => {
    document.getElementById("new-client-form").style.display = "none";
    document.getElementById("new-client-btn").style.display = "";
  };
  document.getElementById("nc-submit").onclick = async () => {
    const name  = document.getElementById("nc-name").value.trim();
    const errEl = document.getElementById("nc-error");
    if (!name) return;
    try {
      await createAdminClient(name);
      const [u, c] = await Promise.all([loadUsers(), loadAdminClients()]);
      _renderAdminTabs(u, c, 'clients');
    } catch (err) { errEl.textContent = err.message; }
  };

  content.querySelectorAll('.issue-token-btn').forEach(btn => {
    btn.onclick = async () => {
      const cid = btn.dataset.cid;
      btn.disabled = true;
      try {
        const tok = await issueToken(cid, `agent-${Date.now()}`);
        _showToken(tok.token);
        await _loadTokenList(cid);
      } catch { btn.disabled = false; }
    };
  });

  content.querySelectorAll('.show-tokens-btn').forEach(btn => {
    btn.onclick = async () => {
      const cid = btn.dataset.cid;
      const box = document.getElementById(`tl-${cid}`);
      if (box.style.display === 'none') {
        btn.textContent = "Tokens ▴";
        box.style.display = "";
        await _loadTokenList(cid);
      } else {
        btn.textContent = "Tokens ▾";
        box.style.display = "none";
      }
    };
  });
}

async function _loadTokenList(cid) {
  const box = document.getElementById(`tl-${cid}`);
  if (!box) return;
  box.innerHTML = `<div class="token-loading">Chargement…</div>`;
  try {
    const tokens = await loadTokens(cid);
    if (!tokens.length) {
      box.innerHTML = `<div class="token-loading">Aucun token.</div>`;
      return;
    }
    box.innerHTML = tokens.map(t => `
      <div class="token-row ${t.is_revoked ? 'revoked' : ''}">
        <span class="token-label">${esc(t.label)}</span>
        <span class="token-date">${fmtDateShort(t.created_at)}</span>
        <span class="token-status">${t.is_revoked ? '✗ révoqué' : '✓ actif'}</span>
        ${t.is_revoked ? '' : `<button class="revoke-btn admin-action-btn" data-cid="${esc(cid)}" data-tid="${esc(t.id)}">Révoquer</button>`}
      </div>`).join('');
    box.querySelectorAll('.revoke-btn').forEach(b => {
      b.onclick = async () => {
        if (!confirm(`Révoquer ce token ? L'agent utilisant ce token sera immédiatement déconnecté.`)) return;
        b.disabled = true;
        try {
          await revokeToken(b.dataset.cid, b.dataset.tid);
          await _loadTokenList(b.dataset.cid);
        } catch { b.disabled = false; }
      };
    });
  } catch (err) {
    box.innerHTML = `<div class="token-loading" style="color:#f87171">${esc(err.message)}</div>`;
  }
}

function _clientRow(client) {
  return `
    <div class="admin-client-row">
      <div class="admin-client-info">
        <span class="admin-client-name">${esc(client.name)}</span>
        <button class="issue-token-btn admin-action-btn" data-cid="${esc(client.id)}">+ Token</button>
        <button class="show-tokens-btn admin-action-btn" data-cid="${esc(client.id)}">Tokens ▾</button>
      </div>
      <div class="token-list" id="tl-${esc(client.id)}" style="display:none"></div>
    </div>`;
}

function _showToken(token) {
  const el = document.createElement('div');
  el.className = 'token-overlay';
  el.innerHTML = `
    <div class="token-box">
      <div class="token-title">Token agent généré</div>
      <div class="token-warn">Copiez maintenant — affiché une seule fois.</div>
      <code class="token-val" id="tok-val">${esc(token)}</code>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button id="tok-copy" class="admin-submit-btn">Copier</button>
        <button id="tok-close" class="admin-cancel-btn">Fermer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  document.getElementById('tok-copy').onclick = () => {
    navigator.clipboard.writeText(token).then(() => {
      document.getElementById('tok-copy').textContent = '✓ Copié';
    });
  };
  document.getElementById('tok-close').onclick = () => el.remove();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Toujours fermer le modal au chargement (le navigateur peut restaurer l'état DOM précédent)
  document.getElementById("admin-modal").style.display = "none";

  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("register-form").addEventListener("submit", handleRegister);
  document.getElementById("logout-btn").addEventListener("click", logout);

  document.getElementById("fill-demo").addEventListener("click", () => {
    document.getElementById("login-email").value = "demo@sapscope.fr";
    document.getElementById("login-pass").value  = "demo-sapscope-2026";
    document.getElementById("login-form").requestSubmit();
  });

  document.getElementById("show-register").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("login-form").style.display    = "none";
    document.getElementById("register-form").style.display = "";
    document.getElementById("reg-error").textContent = "";
  });
  document.getElementById("show-login").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("register-form").style.display = "none";
    document.getElementById("login-form").style.display    = "";
    document.getElementById("login-error").textContent = "";
  });

  document.getElementById("admin-btn").addEventListener("click", openAdminPanel);
  document.getElementById("admin-close-btn").addEventListener("click", () => {
    document.getElementById("admin-modal").style.display = "none";
  });
  document.getElementById("admin-overlay").addEventListener("click", () => {
    document.getElementById("admin-modal").style.display = "none";
  });

  document.getElementById("overview-btn").addEventListener("click", () => {
    const btn = document.getElementById("overview-btn");
    btn.classList.toggle("active");
    if (btn.classList.contains("active")) {
      document.querySelectorAll(".system-item").forEach(i => i.classList.remove("active"));
      applyTheme(SID_PALETTE[0]);
      renderOverview(state.snapshots);
    } else {
      document.getElementById("content").innerHTML = `<div class="placeholder">Select a system.</div>`;
    }
  });

  if (state.token && state.baseUrl) {
    if (state.isAdmin) document.getElementById("admin-btn").style.display = "";
    showAppScreen();
    setStatus(true);
    initApp().catch(() => logout());
  } else {
    showLoginScreen();
  }
});
