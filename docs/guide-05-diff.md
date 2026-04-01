# Snapshot Comparison (Diff)

**Duration:** a few seconds

---

## When to use the diff?

- After a kernel update or Support Package application → verify what changed
- Before/after a migration → document the state
- Audit of unplanned changes

---

## Run a diff

1. Open a **system detail**
2. The **History row** appears if the system has multiple snapshots
3. Click **↔** next to an older snapshot
4. The diff is calculated and displayed immediately

> The active snapshot (currently displayed) is compared to the snapshot of the clicked date.

---

## What the diff shows

### System changes
Modifications to global parameters (kernel, database, host…)

| Parameter | Before | After |
|---|---|---|
| Kernel | 7.53 | 7.54 |

### Components
- **Added** (green) — newly installed components
- **Removed** (red) — uninstalled components
- **Changed** — SP Level change

### Support Packages
- Patches added, removed, or modified between the two snapshots

### Custom ABAP objects
- Delta of the total object count (e.g. +12 Z programs)

---

## Return to normal view

Click the system in the sidebar to reload the standard detail view.
