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
- SID, host, kernel, database
- Collection date and time

### Installed components
Full table of SAP components with:
- Component name
- Release
- SP Level (Support Package level)
- Description

> Use the **search bar** above the table to filter results.

### Applied Support Packages
List of applied patches with:
- Affected component
- Patch number
- Type
- Application date

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
