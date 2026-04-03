Design the system detail page of SAPscope. This page appears when a consultant clicks on a SAP system (e.g. PRD) in the sidebar.

## Layout
Same top nav and left sidebar as the landscape page. The main content area is a vertical stack of sections.

## Sections (top to bottom)

### Hero header
- System ID: PRD (large)
- Hostname: sapprdhst01
- Tags: SAP Release 740 · Linux · Oracle · Kernel 753
- Key-value row: DB Host / Collected date / Received date / Schema version

### Snapshot history strip
A horizontal row of date chips showing previous snapshots for this system:
- "Apr 3 (current)" — active/highlighted
- "Apr 2" — with a compare button
- "Mar 30" — with a compare button
- "Mar 28" — with a compare button
- "+12" badge if more exist

### Stats row (4 cards side by side)
- Components: 32
- Support Packages: 187
- Custom Objects: 1,847 (Z/Y ABAP objects)
- SP Freshness: "Outdated" (last SP applied 18 months ago)

### System Health card
Global health score: 72 / WARNING
Five domain rows, each showing: domain name, progress bar, score, status, short detail
- Stability: 80 / OK — "2 dumps (7d) · 0 jobs aborted"
- Performance: 70 / WARNING — "1 WP PRIV · 0 WP stopped"
- Connectivity: 100 / OK — "0 tRFC errors"
- Infrastructure: 40 / CRITICAL — "PSAPTEMP ≥80%"
- Security: 80 / OK — "5 locked users"

### Claude AI Analysis card
- Title "AI Analysis" with a generate button and language selector (EN / FR / DE / ES)
- Export to PDF button (appears after analysis is generated)
- Analysis content (markdown rendered):
  ## Release & Maintenance Status
  SAP ECC 6.0 EHP8 is in extended maintenance until 2027. Kernel 753 is within supported range.
  ## Support Package Currency
  Last SP applied 18 months ago. BASIS SP18 is 3 stacks behind current.
  ## Custom Development Footprint
  1,847 custom objects — high migration effort expected for S/4HANA transition.
  ## Key Risks
  - Oracle 12c approaching end of SAP support
  - Outdated support packages increase security exposure
  - Large custom code base requires remediation before upgrade
  ## Recommendations
  - Plan SP update campaign before any upgrade project
  - Run SAP Readiness Check for S/4HANA
  - Start custom code analysis with SAP Custom Code Migration app

### Custom Development section (collapsible)
When expanded:
- Bar chart showing custom object count by type: PROG 642, FUGR 318, CLAS 201, TABL 187, DTEL 156, FORM 211, DOMA 89, TTYP 43
- Donut chart with same data

### Installed Components section (collapsible + searchable)
Table with: Component name / Release / SP Level / Description
Example rows:
- SAP_BASIS / 702 / SP0018 / SAP Basis Component
- SAP_ABA / 702 / SP0018 / ABAP Technology Layer
- SAP_BW / 740 / SP0012 / SAP Business Warehouse
- SAP_APPL / 618 / SP0008 / Logistics and Accounting

### Support Packages section (collapsible + searchable)
Table with: Component / Patch name / Type / Applied date
Example rows:
- SAP_BASIS / SAPKB70218 / Support Package / 15 Jan 2024
- SAP_ABA / SAPKA70218 / Support Package / 15 Jan 2024
