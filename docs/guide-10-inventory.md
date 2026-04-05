🇬🇧 English | 🇫🇷 [Français](guide-10-inventory.fr.md)

# Global Inventory

**Access:** All authenticated users (admins see all clients, consultants see only their assigned clients)

---

## Purpose

The **Inventory** view provides a single flat table of every SAP system across all clients. It is designed for a quick cross-client snapshot: versions, kernel health, and status at a glance — without navigating into each landscape individually.

---

## Open the Inventory

Click **Inventory** in the left sidebar (table icon).

---

## What the table shows

| Column | Description |
|---|---|
| Client | Company the system belongs to |
| SID | SAP system identifier |
| Tier | Production / Quality / Development / … |
| Release | SAP release (e.g. `S4HANA 2023`) |
| Kernel | Kernel version + **staleness badge** |
| BASIS SP | Support Package level of the SAP_BASIS component |
| DB | Database type |
| Score | Health score 0–100 (color-coded) |
| Status | OK / WARNING / CRITICAL |
| Snapshot | Age of the last snapshot |

---

## Kernel staleness badges

SAPscope evaluates the kernel version against known SAP long-term maintenance releases:

| Badge | Meaning |
|---|---|
| **Current** (green) | Kernel ≥ 785 — on the current LTM release |
| **Outdated** (orange) | Kernel 777–784 — still supported but not the latest |
| **Obsolete** (red) | Kernel < 777 — out of standard maintenance |

> These badges also appear on system cards in the Landscape view.

---

## Filters and search

- **Search bar** — filter by SID, client name, or SAP release
- **Client dropdown** — restrict to a single client
- **Status dropdown** — show only OK, WARNING, or CRITICAL systems

---

## Sort

Click any column header to sort ascending; click again for descending.

---

## Export CSV

Click **Export CSV** to download the current filtered view as a spreadsheet.

Columns: Client, SID, Tier, SAP Release, Kernel, Kernel Status, BASIS SP, Database, Health Score, Status, Last Snapshot.
