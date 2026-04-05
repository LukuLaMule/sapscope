🇬🇧 English | 🇫🇷 [Français](guide-12-report.fr.md)

# Client Report (PDF)

**Access:** All authenticated users with access to the client

---

## Purpose

The client report generates a print-ready HTML page summarising the health of all SAP systems for a given client. It is designed to be exported as a PDF and shared with the client or a project manager.

---

## Generate a report

1. Open the **Landscape** view of a client
2. Click **Report PDF** in the toolbar (top right)
3. The report opens in a dedicated full-page view

---

## Print or export to PDF

On the report page, click **Print / Export PDF** (top right).

This opens the browser's native print dialog. To export as PDF:
- **Chrome / Edge:** set the destination to "Save as PDF"
- **Firefox:** choose "Print to PDF" in the printer list
- **macOS:** use the PDF button in the bottom-left of the print dialog

---

## Report contents

| Section | Description |
|---|---|
| Cover | Client name, generation date, total system count |
| Executive Summary | Average health score, OK / Warning / Critical counts |
| System Overview | Full table — SID, tier, release, kernel + staleness badge, BASIS SP, DB, score, status, last snapshot |
| Systems Requiring Attention | Detailed breakdown (domain scores, security alerts) for non-OK systems only |
| Component Inventory | Installed components per system (up to 15 per system) |
| Footer | Generation timestamp and client name |

---

## FAQ

**Is the report generated server-side?**
No — it is rendered in the browser from the same data as the Landscape view, then printed via the browser's PDF engine. No server-side PDF library is involved.

**Does the report update automatically?**
No — it is a snapshot of the data at the time you open the page. Refresh the page to get updated data before printing.

**Can I include notes in the report?**
Not currently. The report focuses on technical health data.
