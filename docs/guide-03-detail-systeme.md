🇬🇧 English | 🇫🇷 [Français](guide-03-detail-systeme.fr.md)

# System Detail View

**Duration:** 1 to 2 minutes

---

## Access a system's detail

1. In the sidebar, click the **SID** of the desired system
2. The main area displays the most recent snapshot

---

## Contents

### System information
- SID, host, kernel, database type
- Collection date and time

### Health Score Breakdown
Per-domain scoring (0–100) with individual indicators:

| Domain | What it measures |
|---|---|
| Stability | ABAP dumps (ST22) + aborted jobs (SM37) — last 7 days |
| Performance | Work processes in PRIV or Stopped state |
| Connectivity | tRFC/qRFC errors (ARFCSSTATE) |
| Infrastructure | Tablespace fill level (Oracle/DB2) |
| Security | Locked user accounts |
| Security Ops | Default users active (SAP\*, DDIC), SAP_ALL holders, RFC without logon |
| Transports | Import queue size (STMS) |
| HANA Replication | HSR replication status — only shown on HANA systems with HSR configured |
| Certificates | SSL/TLS certificate expiry (ABAP PSEs via STRUST + HANA M\_PSE\_CERTIFICATES) — only shown when PSEs are readable |

Domains are only included in the score when data is available. Missing domains are excluded from the weighted average rather than penalised.

### Sizing analysis
Automatic dimensioning analysis based on profile parameters (RZ10/RZ11) and HANA memory metrics:
- Work process counts (dialog, background, spool, update)
- Extended memory (EM)
- HANA memory usage and allocation limit

### SSL/TLS Certificates
Visible when the agent can read PSEs via `SSFR_PSE_LIST` / `SSFR_PSE_GET` (ABAP) or `M_PSE_CERTIFICATES` (HANA).

| Status | Meaning |
|---|---|
| `OK` | Certificate valid for more than 30 days |
| `WARNING` | Expires in 7–30 days |
| `CRITICAL` | Expires in less than 7 days |
| `EXPIRED` | Already expired |

Certificates are sorted by expiry date (most urgent first). The subject CN and PSE context (e.g. `SSLS/` for the ICM server certificate) are displayed for each entry.

### HANA System Replication
Visible only on HANA systems where HSR is configured.

| Field | Description |
|---|---|
| Status | `ACTIVE` (green), `SYNCING` / `INITIALIZING` (orange), other (red) |
| Mode | `SYNC`, `ASYNC`, or `SYNCMEM` |
| Sites | Primary → secondary site name and hostname |

> An `ACTIVE` status means replication is running normally. Any other status is flagged in the Health Score Breakdown under the **HANA Replication** domain.

### Installed components
Full table of SAP components with:
- Component name
- Release
- SP Level (Support Package level)
- Description

### Applied Support Packages
List of applied patches with:
- Affected component
- Patch number
- Type
- Application date

### Extended security
In addition to classic indicators (SAP_ALL, RFC without logon, default accounts), three extra metrics are shown when non-zero:

| Indicator | Meaning | Warning threshold |
|---|---|---|
| Inactive users (>90d) | Active accounts with no login in over 90 days | > 20 |
| Never logged in | Active accounts that have never logged in | > 10 |
| SAP_NEW profile | Users with SAP_NEW (nearly equivalent to SAP_ALL) | any value > 0 |

These metrics affect the **Security Ops** domain score.

### Benchmarks — positioning vs portfolio
Compares key metrics of this system against the average of all systems with the **same tier** in the SAPscope instance.

For each metric (dumps, aborted jobs, private WPs, RFC errors, transport queue, SAP_ALL):
- **Comparison bar**: system value relative to the tier average
- **Colored ratio**: green ≤ 1.2×, orange 1.2–2.5×, red > 2.5× the average
- **Badge**: "Within norm" / "Above average" / "Critical"

> Requires at least 2 systems of the same tier in the instance.

### Trends & predictions
Analyses metric evolution over the **last 30 collected snapshots**:

| Icon | Meaning |
|---|---|
| ↑ (red) | Rising trend, threshold approaching |
| ↓ (green) | Falling trend, situation improving |
| → (grey) | Stable, no significant change |

If a threshold is defined and will be reached, a badge shows the estimated deadline:
- **"CRITICAL in X days"** (red) — threshold in less than 7 days
- **"WARNING in X days"** (orange) — threshold in less than 30 days

> Requires at least 3 snapshots to compute a trend.

### Compliance PDF report
**"Compliance report"** button (shield icon) in the page header.

Downloads a PDF (`compliance-{SID}-{date}.pdf`) with 10 checks based on the **SAP Security Guide**:

| Check | Category | Severity if non-compliant |
|---|---|---|
| SEC-001 | Default accounts | SAP* disabled | CRITICAL |
| SEC-002 | Default accounts | DDIC disabled | CRITICAL |
| SEC-003 | Default accounts | EARLYWATCH disabled | HIGH |
| SEC-004 | Authorizations | No SAP_ALL user | CRITICAL |
| SEC-005 | Authorizations | No SAP_NEW user | HIGH |
| SEC-006 | RFC connections | Type-3 RFC with logon user defined | HIGH |
| SEC-007 | RFC connections | Trusted connections < 5 | MEDIUM |
| SEC-008 | Account hygiene | Inactive >90d users < 20 | MEDIUM |
| SEC-009 | Account hygiene | Never-logged-in users < 10 | MEDIUM |
| SEC-010 | Account hygiene | Locked accounts < 50% | LOW |

### Custom ABAP objects
Donut chart + table of Z/Y developments:
- Breakdown by type (program, function, class, table, etc.)
- Total number of custom objects

---

## Filter data

Each table has a search bar — typing a term filters results in real time.

---

## Navigate history

If the system has multiple snapshots, a **History row** appears below the title:
- Click a **date** to load that snapshot
- Click **↔** to compare two snapshots (see Diff guide)
