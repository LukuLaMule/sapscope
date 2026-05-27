# Roadmap

Feature requests and milestones are tracked via [GitHub Issues](https://github.com/LukuLaMule/sapscope/issues).

## Planned features

| Priority | Feature | Notes |
|----------|---------|-------|
| P1 | SAP certificate monitoring | ABAP PSE (SSFR_PSE_LIST) + HANA (M_PSE_CERTIFICATES) — expiry alerts |
| P1 | BW process chains | RSPCCHAIN / RSPCPROCESSLOG — for BW/4HANA clients |
| P2 | PI/PO XI queues | SXMSCLUP, SXMSPEMAS — extends existing qRFC monitoring |
| P2 | Public REST API | Integration endpoints for third-party tooling |
| P3 | SSO / SAML | Active Directory integration for enterprise deployments |
| P3 | Native mobile app | iOS / Android (currently PWA-installable) |

## Already implemented (v0.1.0-beta)

- ✅ RFC collection via `pyrfc` (ashost, mshost, SAProuter, systems.yaml, auto-discovery)
- ✅ AI-powered diagnostics (Claude / Anthropic SDK)
- ✅ Snapshot diff — temporal and cross-system (PRD vs QAS across clients)
- ✅ HANA System Replication monitoring (M_SYSTEM_REPLICATION)
- ✅ Health scoring — 6 domains (Stability, Performance, Connectivity, Infrastructure, Security, Transports)
- ✅ PDF client reports — auto-scheduled (daily/weekly/monthly), white-label logo
- ✅ Compliance report — 10 SAP Security Guide checks (SEC-001 to SEC-010)
- ✅ Predictive trends — linear regression, "CRITICAL in X days" warnings
- ✅ Cross-tier benchmarks — compare your system against others of the same tier
- ✅ Decommission detection — automatic via agent heartbeat
- ✅ Extended security metrics — inactive users, never-logged-in, SAP_NEW role
- ✅ Self-hosted trial kit — automatic 30-day trial via email
- ✅ PWA — installable on mobile (service worker, offline support)

---

Suggestions welcome — open an issue or reach out at [pro@luku.fr](mailto:pro@luku.fr)
