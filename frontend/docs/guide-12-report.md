🇬🇧 English | 🇫🇷 [Français](guide-12-report.fr.md)

# Client Report (PDF)

**Access:** All authenticated users with access to the client  
**Admin only:** configuration panel (schedule, recipients, sections)

---

## Overview

SAPscope generates a professional PDF report server-side (WeasyPrint) for each client. The report covers all SAP systems with health scores, domain breakdowns, key metrics, and AI-generated assessments. It can be downloaded on demand or sent automatically by email on a daily / weekly / monthly schedule.

---

## Download the report

1. Open a client's **Report** page (accessible from the top navigation)
2. Click **Download PDF** (top right)
3. The server generates the PDF and the browser downloads it as `rapport-<client>-<date>.pdf`

The PDF is generated from the latest snapshot per SID collected in the last 36 hours.

---

## Report contents

| Section | Description | Can be disabled |
|---|---|---|
| Cover page | Client name (or custom title), global health score, system count, date | — |
| Health by domain | Score + RAG status bar per domain (Stability, Performance, Connectivity, Infrastructure, Security, Transports) | Yes |
| Key metrics | Numerical indicators: ABAP dumps, aborted jobs, locked users, tablespace usage, etc. | Yes |
| AI assessment | Claude-generated analysis, truncated to 300 words | Yes |

---

## Admin: configure the report

Admins can configure the report for each client from the **Admin** panel → **Clients** tab → **Reports** section, or directly from the Report page.

### Schedule

| Setting | Values |
|---|---|
| Enabled | On / Off |
| Recipients | List of email addresses |
| Frequency | Daily · Weekly (choose weekday) · Monthly (choose day 1–28) |
| Language | French · English |

### Customisation

| Setting | Effect |
|---|---|
| Report title | Displayed on the cover page instead of the client name. Leave empty to use the client name. |
| Health by domain | Include / exclude the domain score table |
| Key metrics | Include / exclude the numerical indicator table |
| AI assessment | Include / exclude the Claude analysis block |

### Send now

Click **Send now** to immediately send the report to all configured recipients, regardless of the schedule.

---

## Scheduled sending

When enabled, SAPscope checks every hour whether a report is due. Anti-duplication logic prevents sending more than once in a 20-hour window. The report uses the latest snapshot available at send time.

---

## FAQ

**Is the PDF generated server-side?**  
Yes — WeasyPrint converts an HTML template to PDF on the server. No browser plugin or print dialog is required.

**What if there are no recent snapshots?**  
The download and send-now endpoints return a 404 error if no snapshot was received in the last 36 hours.

**Can I change the logo on the cover?**  
Yes — upload a client logo in the Admin panel (Clients tab → Logo column). It appears in the top-right corner of the cover page.
