# SAPscope — UI Design Brief for Google Stitch

## Product
SAPscope is a **SAP Landscape Intelligence** web application for SAP Basis consultants.
It displays technical snapshots of SAP systems (ERP, BW, PI, GRC, SRM…) collected by an agent installed on each server. The goal is to give a consultant a fast, global view of a client's SAP infrastructure to assess upgrade/migration projects.

---

## Design Language

- **Theme**: Dark, dense, professional. Inspired by developer dashboards (Vercel, Linear, Datadog).
- **Background**: very dark navy `#07071a`, cards on `#10102a`, surface `#0c0c22`
- **Borders**: subtle `#1e1e42`
- **Text**: light grey `#e2e4f0`, dimmed `#6b6d8a`
- **Accent**: indigo/violet gradient `#818cf8 → #c084fc`
- **Fonts**: Inter (UI), JetBrains Mono (codes, IDs, numbers)
- **Radius**: 8px cards, 5px inner elements
- **Status colors**:
  - OK / Healthy: `#34d399` (green)
  - Warning: `#fb923c` (orange)
  - Critical / Error: `#f87171` (red)
  - Unknown / Stale: `#6b6d8a` (grey)
- Each SAP system (SID) gets a unique color from a palette (indigo, violet, emerald, blue, pink, orange, teal, amber, red, lime)

---

## App Layout (always visible once logged in)

```
┌─────────────────────────────────────────────────────────────┐
│ TOPBAR (46px, dark surface)                                 │
│  [SAPscope logo]  ● status  [Client selector ▾]  [spacer]  │
│                             [LANDSCAPE btn] [🔑] [logout]   │
├──────────────┬──────────────────────────────────────────────┤
│  SIDEBAR     │  CONTENT AREA (scrollable)                   │
│  (220px)     │                                              │
│              │                                              │
│  [LANDSCAPE] │                                              │
│  btn         │                                              │
│              │                                              │
│  ── Systems ─│                                              │
│  [PRD]  84 ● │                                              │
│  [DEV]  63 ● │                                              │
│  [QAS]  78 ● │                                              │
│  [BWP]  95 ● │                                              │
│  [GRC]  65 ● │                                              │
│  [SRM]  73 ● │                                              │
│  [PI1]  52 ● │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

---

## TOPBAR

- **Logo**: `SAPscope` in monospace font, gradient indigo→violet, bold
- **Status dot**: 7px circle — green (all agents recent), orange (some stale), red (all stale)
- **Client selector**: dropdown — consultant may have multiple clients ("ACME Industries", "Demo", "MLC")
- **LANDSCAPE button**: rectangular button, subtle border — opens the landscape overview view
- **🔑 button**: opens change-password modal
- **logout button**: text button

---

## SIDEBAR

- Fixed left panel, 220px wide, dark background
- **LANDSCAPE button** at top: icon `⊞` + label "LANDSCAPE" + sub "Vue d'ensemble". When active, has a left colored border (accent color).
- **System list**: one item per SAP system (deduplicated — latest snapshot per SID)

### System Item (sidebar)
```
┌─────────────────────────────┐
│  [PRD]●  ← SID badge (colored pill, unique color per SID)
│  sapprdhst01  ← hostname, dimmed
│  12 comp  [84]  2h ago      │
└─────────────────────────────┘
```
- SID badge: rounded, background tinted to the SID color
- `[84]` : health score badge — green/orange/red pill with score number
- Stale dot: orange dot inside SID badge if agent hasn't reported in >24h
- Active item: left border in SID color, slightly highlighted background

---

## CONTENT AREA — System Detail View

When a system is selected in the sidebar, the content area shows:

### 1. Stale Banner (conditional)
Only shown if last snapshot > 24h old.
```
⚠  Agent unreachable — last collection 3 days ago. Check the agent service on the SAP server.
```
Orange background banner, full width.

---

### 2. Hero Header
```
┌──────────────────────────────────────────────────────────────┐
│  PRD                   sapprdhst01                           │
│  (large SID, accent    [740]  [Linux]  [Oracle]  [Kernel 753]│
│   color, mono font)                                          │
│                                                              │
│  DB Host: sapdbhst01   Collected: 03 Apr 2026 08:00          │
│  Received: 03 Apr 2026 08:00:12   Schema: 1                  │
└──────────────────────────────────────────────────────────────┘
```
- Large SID in colored monospace font (left)
- Tags: SAP release (accent colored), OS, DB type (colored per DB brand), Kernel version
- KV cells below: DB Host, Collected, Received, Schema version

---

### 3. Snapshot History Row (optional, only if >1 snapshot for this SID)
```
Historique  [Apr 3 ●]  [Apr 2 ↔]  [Mar 30 ↔]  [Mar 28 ↔]  +12
```
- Horizontal scrollable row of date chips
- Active chip: highlighted in SID color
- Each past chip has a `↔` diff button to compare with current
- `+12` badge: click to expand inline
- "Charger plus" button at end if server may have more

---

### 4. Stats Row
4 cards in a horizontal row:
```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│    32    │  │   187    │  │  1,847   │  │  Current │
│Components│  │  Support │  │  Custom  │  │    SP    │
│          │  │ Packages │  │  Z/Y obj │  │ Freshness│
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```
- Large number in mono font
- Small subtitle label below
- SP Freshness card: label "Current" (green) / "Outdated" (orange) / "Obsolete" (red) + sub label with SP count or age

---

### 5. System Health Card
```
┌──────────────────────────────────────────────────────────────┐
│  System Health                          72  [WARNING]        │
├──────────────────────────────────────────────────────────────┤
│  ◉ Stability      ████████░░  80  OK        3 dumps · 0 aborted │
│  ⚡ Performance    ███████░░░  70  WARNING   1 WP PRIV           │
│  ⇄ Connectivity   ██████████ 100  OK        0 tRFC errors        │
│  ◫ Infrastructure ████░░░░░░  40  CRITICAL  PSAPTEMP ≥80%        │
│  ⊛ Security       ████████░░  80  OK        5 locked users       │
└──────────────────────────────────────────────────────────────┘
```
- Card header: title left, score (large mono number in status color) + status badge right
- Each domain row:
  - Icon (small, dimmed)
  - Domain name (fixed width)
  - Progress bar (thin, 4px, colored: green/orange/red)
  - Score number (mono, dimmed)
  - Status label (OK/WARNING/CRITICAL in matching color)
  - Detail text (dimmed, right side — specific metric)
- If no health data: "No health data — update the agent to enable health monitoring."
- Score: 80-100 = OK green, 50-79 = WARNING orange, 0-49 = CRITICAL red

---

### 6. Claude AI Analysis Card
```
┌──────────────────────────────────────────────────────────────┐
│  ✦  Claude AI Analysis          [EN▾]  [✦ Analyse]  [↓ PDF] │
│     Automated SAP landscape assessment                       │
├──────────────────────────────────────────────────────────────┤
│  ## Release & Maintenance Status                             │
│  SAP ECC 6.0 EHP8 (release 618) is in extended maintenance   │
│  until 2027. Kernel 753 is within supported range.           │
│                                                              │
│  ## Key Risks                                                │
│  - Support packages last applied 18 months ago               │
│  - 1,847 custom objects represents a high migration effort   │
│  - Oracle 12c approaching end of SAP support                 │
│                                                              │
│  claude-sonnet-4-6 · 3,241 tokens · 03 Apr 2026 08:05       │
└──────────────────────────────────────────────────────────────┘
```
- Distinct AI card style: slightly different border color (indigo tint)
- Header: spark icon `✦`, title + tagline, language selector dropdown, Analyse button (primary accent), PDF export button (appears after analysis), token/model meta
- Body: markdown-rendered text (headings, bullets, bold)
- Button states: "✦ Analyse" → disabled + "Running…" → "✦ Re-analyse"

---

### 7. Custom Development Card (collapsible)
```
┌──────────────────────────────────────────────────────────────┐
│  › Custom Development              [1,847 objects]           │
├──────────────────────────────────────────────────────────────┤  ← collapsed by default, click to expand
│  Donut chart + bar chart (object count by type)              │
│  PROG 642 ████████████████                                   │
│  FUGR 318 ████████                                           │
│  CLAS 201 █████                                              │
│  TABL 187 ████                                               │
│  …                                                           │
└──────────────────────────────────────────────────────────────┘
```

---

### 8. Installed Components Card (collapsible + searchable)
```
┌──────────────────────────────────────────────────────────────┐
│  › Installed Components            [32]                      │
├──────────────────────────────────────────────────────────────┤
│  🔍 Filter components…                                       │
│  ┌─────────────┬─────────┬──────────┬──────────────────────┐ │
│  │ Component   │ Release │ SP Level │ Description          │ │
│  ├─────────────┼─────────┼──────────┼──────────────────────┤ │
│  │ SAP_BASIS   │ 702     │ SP 0018  │ SAP Basis Component  │ │
│  │ SAP_ABA     │ 702     │ SP 0018  │ ABAP Technology…     │ │
│  │ …           │         │          │                      │ │
│  └─────────────┴─────────┴──────────┴──────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

### 9. Support Packages Card (collapsible + searchable)
Same pattern as Components, with columns: Component / Patch / Type / Applied date.

---

## CONTENT AREA — Diff View

When user clicks `↔` on a history chip:

```
┌──────────────────────────────────────────────────────────────┐
│  PRD    ← Apr 2     ↔     Apr 3 (actuel)    [← Back]        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Système                  [1 modification]                   │
│  ┌────────────────┬──────────────┬──────────────┐           │
│  │ Champ          │ Avant        │ Après        │           │
│  ├────────────────┼──────────────┼──────────────┤           │
│  │ SAP Release    │ 617          │ 618          │           │
│  └────────────────┴──────────────┴──────────────┘           │
│                                                              │
│  Composants               [2 modif.] [+1] [-0]              │
│  ┌───────────────┬──────────────────┬────────────────────┐  │
│  │ SAP_BASIS     │ SP 0017          │ SP 0018            │  │
│  │ + NEW_COMP    │ — (not present)  │ 700 SP 0001        │  │
│  └───────────────┴──────────────────┴────────────────────┘  │
│                                                              │
│  Custom Development       [+47 objects]                      │
│  ┌───────────────┬──────────────────┐                       │
│  │ PROG          │ +10              │                       │
│  │ CLAS          │ +5               │                       │
│  └───────────────┴──────────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```
- Added rows: green text with `+`
- Removed rows: red text with `−`
- Changed rows: old in muted red, new in muted green

---

## CONTENT AREA — Landscape Overview

When LANDSCAPE button is clicked in sidebar:

```
┌──────────────────────────────────────────────────────────────┐
│  SAP Landscape — ACME Industries              [8 systems]    │
│  Last updated: 03 Apr 2026 08:05                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  PRD     │  │  DEV     │  │  QAS     │  │  BWP     │   │
│  │ ECC 6.0  │  │ ECC 6.0  │  │ ECC 6.0  │  │  BW 7.5  │   │
│  │ Oracle   │  │ Oracle   │  │ Oracle   │  │  HANA    │   │
│  │ [84] OK  │  │ [63] WRN │  │ [78] WRN │  │ [95] OK  │   │
│  │ 3h ago ✓ │  │ 2h ago ✓ │  │ 4h ago ✓ │  │ 1h ago ✓ │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  GRC     │  │  SRM     │  │  PI1     │  │  BWA     │   │
│  │ GRC 10.1 │  │ SRM 7.0  │  │ PI 7.4   │  │  BW 7.4  │   │
│  │ Oracle   │  │ Oracle   │  │ Oracle   │  │  Oracle  │   │
│  │ [65] WRN │  │ [73] WRN │  │ [52] WRN │  │ [52] WRN │   │
│  │ 5h ago ✓ │  │ 3h ago ✓ │  │ ⚠ 2d ago │  │ ⚠ 3d ago │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  Summary row:                                                │
│  8 systems · 3 OK · 5 WARNING · 0 CRITICAL · 2 stale        │
└──────────────────────────────────────────────────────────────┘
```
- Grid of system cards, 4 per row
- Each card: SID (large, colored), product name, DB, health badge, last snapshot time
- Stale systems: dimmed + orange warning icon
- Summary strip at bottom: totals

---

## Modals

### Admin Panel (full-screen overlay)
Two tabs: **Utilisateurs** / **Clients**

**Clients tab:**
- List of clients with: name, ID, number of tokens, creation date
- Actions per client: view tokens, revoke token, delete client
- "Create client" button
- Per-client token section: label, creation date, status (active/revoked), [Revoke] button
- "Issue new token" button → shows generated token once (copy-to-clipboard)

**Users tab:**
- List of users: email, admin badge, assigned clients, creation date
- Actions: reset password, toggle admin, assign client, remove client, delete
- "Create user" button → email + password form

---

### Change Password Modal
Small centered modal:
- Current password
- New password (12+ chars)
- Confirm new password
- Error message area
- Submit button

---

## Login Screen

Full-screen dark background. Centered card:
```
┌──────────────────────────┐
│  SAPscope                │
│  SAP Landscape Intelligence│
│                          │
│  [demo hint: auto-login] │
│                          │
│  email ________________  │
│  password _____________  │
│  [error message]         │
│  [  Connexion →       ]  │
│                          │
│  Pas de compte ? S'inscrire · Mot de passe oublié ?
└──────────────────────────┘
```
Forgot password and Register are sub-forms in the same card (show/hide).

---

## Key Interactions

- Clicking a system in sidebar → loads detail view (loading spinner in content area)
- Clicking a history chip → loads that snapshot's detail
- Clicking `↔` on a history chip → loads diff view
- Clicking `✦ Analyse` → calls Claude API, shows streaming-like placeholder, renders markdown
- Clicking `↓ PDF` → opens print-ready HTML in new tab, auto-triggers browser print
- Collapsible cards: click header to expand/collapse (arrow rotates 90°)
- Filter inputs in Components/SP cards → live filter table rows
- Admin button (⚙ admin, only visible for admins) → opens admin modal

---

## Data shown per system (summary of all fields)

| Field | Source | Where displayed |
|---|---|---|
| SID (system ID) | RFC_SYSTEM_INFO | Sidebar, hero, everywhere |
| Hostname | RFC_SYSTEM_INFO | Hero header |
| SAP Release (e.g. 740) | RFC_SYSTEM_INFO | Tag, stats |
| Kernel version | RFC_SYSTEM_INFO | Tag |
| OS | RFC_SYSTEM_INFO | Tag |
| DB type (Oracle/HANA/DB2) | RFC_SYSTEM_INFO | Tag, stat card |
| DB hostname | RFC_SYSTEM_INFO | Hero KV |
| Component list + SP level | CVERS table | Components card, diff |
| Support packages list | PAT03 table | SP card, diff |
| Custom objects count + by type | TADIR table | Stats, custom dev card |
| Health score (0-100) | Computed | Sidebar badge, health card |
| Stability (dumps + aborted jobs) | SNAP + TBTCO | Health card |
| Performance (work processes) | TH_WPINFO | Health card |
| Connectivity (tRFC errors) | ARFCSSTATE | Health card |
| Infrastructure (tablespace %) | DBSNP | Health card |
| Security (locked users) | USR02 | Health card |
| Claude AI analysis | Claude API | Analysis card |
| Snapshot timestamp | Agent | Hero KV, history row |
