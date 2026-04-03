Design the main dashboard page of SAPscope, called "Landscape Overview".

This is what a consultant sees when they open the app. It shows all SAP systems belonging to a client in a grid.

## Layout
- Top navigation bar with: app name, a client selector dropdown (the consultant may manage multiple clients), and a logout button
- Left sidebar with a list of all SAP systems (by their 3-letter ID: PRD, DEV, QAS, BWP, GRC…) — each item shows the SID, hostname, and a small health score badge
- Main content area showing the landscape grid

## Landscape grid content
Each system card in the grid shows:
- System ID (SID) — e.g. PRD, DEV, QAS, BWP, GRC, SRM, PI1, BWA
- SAP product name — e.g. "SAP ECC 6.0", "SAP BW 7.5", "SAP GRC 10.1", "SAP PI 7.4"
- Database type — Oracle / HANA / DB2 / SQL Server
- Health score out of 100 with status: OK / WARNING / CRITICAL
- Last snapshot time — e.g. "2 hours ago" or "⚠ 3 days ago" if the agent is unreachable
- Number of installed components

## Summary strip at the bottom of the grid
- Total number of systems
- Count of OK / WARNING / CRITICAL systems
- Count of stale systems (agent unreachable for >24h)

## Example data to use
8 systems: PRD (OK, 84), DEV (WARNING, 63), QAS (WARNING, 78), BWP (OK, 95), GRC (WARNING, 65), SRM (WARNING, 73), PI1 (WARNING, 52 — stale), BWA (WARNING, 52 — stale)
