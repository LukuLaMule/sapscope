# SAPscope — Claude Code Instructions

## Project: SAPscope

When working on SAPscope, the backend is Python (FastAPI). The app frontend is React + TypeScript + Vite (`frontend-react/`). The landing page and docs are Vanilla JS (`frontend/`). The project uses Docker for deployment. Always verify directory names on the server before assuming paths — they may differ from expectations (e.g., 'Cols' vs 'pycol').

## Deployment

Always rebuild Docker containers after making backend or frontend changes. Never assume file changes will be picked up without a rebuild — Docker caching frequently serves stale content.

After any backend change, verify the running container responds correctly before declaring success.

## Travail parallèle backend + frontend

Pour les sessions impliquant des changements simultanés backend et frontend, utilise des sous-agents parallèles :
- **Workstream 1 (Backend)** : tests, endpoints, rebuild Docker, vérification curl
- **Workstream 2 (Frontend)** : composants React, UI
- Les deux workstreams partagent un contrat API défini en amont
- Intégration et vérification end-to-end après les deux workstreams

## Design UI piloté par tests

Pour les refontes visuelles, suivre cette séquence sans demander de feedback intermédiaire :
1. Convertir les exigences visuelles en assertions testables (border-radius, couleurs hex, colonnes grid, tailles de police)
2. Écrire les tests d'abord
3. Implémenter le design
4. Lancer les tests — corriger et relancer jusqu'à 100% de passage
5. Ne soumettre le résultat qu'une fois tous les tests verts

Toujours demander à l'utilisateur : palette hex, grille (colonnes/lignes), hiérarchie des composants, tailles typographiques exactes.

## Positionnement produit

SAPscope est un outil de **surveillance, analyse et alerte** pour administrateurs SAP Basis. Il dit *quoi surveiller et où agir*, pas *comment le faire*.

**Dans le périmètre :** SM50/SM66 (WP states), ST22 (dumps), SM21 (logs), SM37 (jobs), STMS (transports), SM12 (verrous), SMQ1/SMQ2 (qRFC), RZ10/RZ11 (profils via PAHI), SP01 (spool), sécurité (SAP_ALL, RFC, users défaut), performances (response time, buffers, sizing HANA/Oracle).

**Hors périmètre :** installations, copies système, montées de version, configuration active SNC/SSO, setup HA/HANA Replication, scripts d'automatisation, support incidents, cloud/VPN/firewall.

**Nuance certificats :** la *configuration* est hors périmètre, mais la *surveillance* des certificats installés (expiration, émetteur, validité) sur SAP, Java stack ou HANA est dans le périmètre — c'est de la supervision comme n'importe quel autre indicateur.

SAPscope est un outil pour le Basis admin, pas un remplacement. Les nouvelles fonctionnalités doivent rester dans ce périmètre surveillance/analyse.

**Roadmap fonctionnelle (par priorité) :**
1. Stripe live — passage sk_test_ → sk_live_ (action manuelle)
2. UptimeRobot — monitoring /healthz (action manuelle)

**Implémenté — use cases avancés :**
- HANA System Replication (HSR) — collecte via M_SYSTEM_REPLICATION, domaine health scorer, section UI dans SystemDetailPage
- Connexion via Message Server (mshost/msserv/r3name) — via systems.yaml
- Connexion via SAProuter — via systems.yaml (champ `saprouter`)
- Agent distant multi-systèmes — via systems.yaml (prioritaire sur SAPSCOPE_SYSTEMS)
- White-label logo client — champ `logo_b64` (TEXT, nullable) sur le modèle `Client` ; endpoint `PATCH /api/v1/admin/clients/{id}/logo` (max 500 KB image / 680 KB base64) ; upload via AdminPage (colonne Logo dans l'onglet Clients) ; affiché en haut à droite du bandeau navy dans ReportPage (PDF). Migration : `backend/migrations/20260430_client_logo.sql`
- Diff cross-systèmes — compare les stacks techniques (composants, support packages, paramètres système) entre deux SIDs différents, même issus de clients différents.
  - Backend : `GET /api/v1/clients/{id}/snapshots/{id}/diff?cross_system=true&base_client_id={id}` — paramètre `cross_system=false` par défaut (comportement inchangé) ; `base_client_id` optionnel pour cross-client
  - Nouveau endpoint : `GET /api/v1/snapshots/latest?limit=50` — dernier snapshot par (client, SID) pour tous les clients accessibles ; retourne `{id, client_id, client_name, system_sid, collected_at, health}`
  - Frontend : `DiffPage.tsx` — deux onglets : "Same System" (diff temporel inchangé) et "Cross-System" (sélecteur parmi tous les systèmes disponibles, résultats avec badge `PRD vs QAS`, tableaux composants/SP/custom objects)
- Kit d'essai self-hosted automatisé — endpoint public `POST /api/v1/trial/request` (body `{email, org, name}`) ; 201 = kit envoyé, 409 = email déjà utilisé ; rate-limit 3/h
  - Modèle `TrialRequest` dans `models.py` + migration `backend/migrations/20260430_trial_requests.sql`
  - Router : `backend/app/routers/trial.py` — crée une `License` plan=trial 30j + un `TrialRequest`, envoie le kit par email en background
  - Mailer : `send_trial_kit_email()` + `send_trial_reminder_email()` dans `mailer.py`
  - Job APScheduler `trial_reminders` à 9h00 dans `trial_reminder.py` — rappel J+25 (expiration dans 4-6 jours)
- Serveur de licences central — `backend/app/routers/license_server.py` + modèle `License` dans `models.py`
  - Activer via `IS_LICENSE_SERVER=true` dans l'env et `app.include_router(license_server.router)` dans `main.py`
  - Endpoints publics : `POST /api/license/validate`, `POST /api/license/activate`
  - Endpoints admin : `POST /api/admin/licenses`, `GET /api/admin/licenses`
  - Plans : `trial` (2 users) | `solo` (1) | `team` (5) | `enterprise` (999)
  - Migration SQL : `backend/migrations/20260429_add_licenses_table.sql`
- Rapports PDF automatiques par client — WeasyPrint HTML→PDF, envoi planifiable
  - Modèle `ClientReportConfig` dans `models.py` — `enabled`, `recipient_emails` (JSONB), `schedule` (daily|weekly|monthly), `schedule_day`, `language` (fr|en), `last_sent_at` ; relation 1-1 avec `Client`
  - Migration : `backend/migrations/20260430_client_report_config.sql`
  - Générateur : `backend/app/pdf_report.py` — `generate_client_pdf(client, snapshots_data, language, report_date)` → bytes PDF ; template Jinja2 inline, rendu WeasyPrint ; page couverture (fond sombre, logo ou "SAPscope", score global coloré), sections par système (domaines RAG + barres de progression, métriques clés, analyse IA tronquée à 300 mots, tendance ↑/↓ vs snapshot précédent) ; footer `@page` CSS (client name, date, page X/Y, "Powered by SAPscope")
  - Router : `backend/app/routers/reports.py` — `GET/PATCH /api/v1/clients/{id}/report-config`, `GET /api/v1/clients/{id}/report/pdf` (download blob nommé `rapport-{client}-{date}.pdf`), `POST /api/v1/clients/{id}/report/send` (envoi immédiat, admin only)
  - Mailer : `send_report_pdf_email(recipients, client_name, pdf_bytes, report_date, sender_name)` dans `mailer.py` — email sobre avec PDF en `MIMEApplication` attachment
  - Scheduler : job APScheduler `scheduled_reports` toutes les heures (CronTrigger(minute=0)) dans `main.py` ; logique dans `backend/app/scheduled_reports.py` — anti-doublon 20h, `_should_send()` vérifie daily/weekly(weekday)/monthly(day)
  - Dépendances : `weasyprint>=61.0`, `jinja2>=3.1.0` dans `requirements.txt` ; libs système dans `Dockerfile` (`libpango-1.0-0 libharfbuzz0b libfontconfig1 libgdk-pixbuf2.0-0 libffi-dev shared-mime-info`)
  - Données indicateurs connues : `stability.{dumps_7d, jobs_aborted_7d}`, `performance.{wp_priv, wp_stopped}`, `connectivity.{trfc_errors}`, `infrastructure.{max_used_pct, warning:[], critical:[]}`, `security.{users_locked}`, `security_ops.{sap_all_count}`, `transports.{import_queue_count}`
  - Frontend attendu : `src/hooks/useReportConfig.ts`, `src/components/ReportConfigPanel.tsx`, bouton "Télécharger PDF" dans `ReportPage.tsx`, panneau Rapports dans `AdminPage.tsx`, fonctions API dans `lib/api.ts`

- Détection décommissionnement automatique — agent heartbeat + détection backend
  - Table `agent_heartbeats` (client_id, monitored_sids JSONB, agent_version, last_seen_at) + table `system_decommissions` (client_id, system_sid, status, detected_at)
  - Migration : `backend/migrations/20260504_agent_heartbeat_decommission.sql`
  - Agent envoie `POST /api/v1/agent/heartbeat` avec `monitored_sids` ; backend détecte SID absent comme candidat au décommissionnement
  - Router : `backend/app/routers/heartbeat.py` ; détecteur : `backend/app/decommission_detector.py` (job APScheduler CronTrigger(minute=30))
  - Admin endpoints : `GET /agent-health`, `GET /decommission-candidates`, `POST /systems/{client_id}/{sid}/decommission`, `POST /systems/{client_id}/{sid}/restore`
  - Frontend : `AgentHealthPanel.tsx` + `DecommissionPanel.tsx` dans onglet "Infrastructure" de AdminPage
  - API : `fetchAgentHealth()`, `fetchDecommissionCandidates()`, `confirmDecommission()`, `restoreSystem()` dans `lib/api.ts`
- Benchmarks cross-tier — compare les métriques d'un système contre la moyenne des systèmes du même tier dans l'instance
  - Router : `backend/app/routers/benchmarks.py` — `GET /api/v1/clients/{id}/systems/{sid}/benchmarks`
  - Métriques : `stability.dumps_7d`, `stability.jobs_aborted_7d`, `performance.wp_priv`, `connectivity.trfc_errors`, `transports.import_queue_count`, `security_ops.sap_all_count`
  - Régression DISTINCT ON (client_id, system_sid) sur les derniers snapshots par tier ; retourne ratio, avg, médiane, status (good/warning/critical/unknown)
  - Frontend : `BenchmarkSection.tsx` — barre comparative, ratio coloré, badge status
- Sécurité étendue — 3 nouvelles métriques collectées par l'agent dans `get_security_info()` :
  - `inactive_users_count` / `inactive_users` : USR02 WHERE TRDAT < 90j AND UFLAG = 0
  - `never_logged_in_count` / `never_logged_in` : USR02 WHERE TRDAT = '00000000' AND UFLAG = 0
  - `sap_new_count` / `sap_new_users` : AGR_USERS WHERE AGR_NAME = 'SAP_NEW'
  - Health scorer `security_ops` : pénalités -5 si inactive>20, -10 si inactive>50, -3 si never_logged_in>10, -5 si sap_new>0
  - Frontend : affichage conditionnel dans section sécurité de SystemDetailPage (masqué si valeur = 0)
- Tendances prédictives — régression linéaire sur les 30 derniers snapshots
  - Router : `backend/app/routers/trends.py` — `GET /api/v1/clients/{id}/systems/{sid}/trends`
  - Métriques : `infrastructure.max_used_pct` (seuil 90%), `stability.dumps_7d` (5), `stability.jobs_aborted_7d` (3), `performance.wp_priv` (80)
  - Régression linéaire stdlib pure (pas numpy) ; retourne slope_per_day, days_to_threshold, trend (up/down/stable), status (ok/warning/critical)
  - Frontend : `TrendSection.tsx` — sparklines SVG inline, flèche tendance, badge "CRITIQUE dans Xj"
- Rapport conformité PDF par système — 10 checks SAP Security Guide
  - Générateur : `backend/app/compliance_report.py` — `generate_compliance_pdf(payload, indicators, system_info)` → bytes PDF WeasyPrint
  - Router : `backend/app/routers/compliance.py` — `GET /api/v1/clients/{id}/systems/{sid}/compliance-report` → PDF téléchargeable `compliance-{SID}-{date}.pdf`
  - Checks : SEC-001 à SEC-010 (comptes défaut, SAP_ALL, SAP_NEW, RFC, inactifs, jamais connectés, verrouillés)
  - Frontend : bouton "Rapport conformité" avec icône ShieldCheck dans header SystemDetailPage ; `downloadComplianceReport()` dans `lib/api.ts`
- PWA (Progressive Web App) — SAPscope installable sur mobile
  - `frontend-react/public/manifest.json` — name, icons (sapscope-icon.svg), theme_color #31c4d5, background #0d1f38, display standalone
  - `frontend-react/public/sw.js` — service worker cache-first (ne pas intercepter /api/)
  - `frontend-react/public/sapscope-icon.svg` — carré arrondi fond #0d1f38, "SS" en #31c4d5
  - `index.html` — balises PWA (manifest, theme-color, Apple mobile meta)
  - `main.tsx` — enregistrement service worker sur window.load

**En attente d'un système SAP de test :**
- Surveillance certificats SSL/TLS — ABAP PSE (SSFR_PSE_LIST/GET) + HANA (M_PSE_CERTIFICATES). Non testable sans accès RFC réel. Lib `cryptography` déjà présente dans le container.
- BW process chains (RSPCCHAIN/RSPCPROCESSLOG) — pour clients BW/4HANA
- PI/PO queues XI (SXMSCLUP, SXMSPEMAS) — en complément des qRFC existants

**Décision produit — pas d'alertes temps réel :**
Les alertes email/webhook (Slack, Teams) sont exclues de la roadmap. SAPscope collecte des snapshots périodiques — tout canal d'alerte aurait le même retard que l'intervalle de collecte, sans avantage sur CCMS/RZ20/SolMan. La valeur de SAPscope est dans la vision cross-landscape, l'historique, les métriques SAP-spécifiques combinées, et la surveillance horizon (certificats). Pas dans le temps réel.

## Documentation — règle de synchronisation

La documentation existe en deux endroits **identiques** qui doivent toujours rester synchronisés :
- `docs/` — source de référence (versionnée avec le code)
- `frontend/docs/` — fichiers servis par nginx (montés en `:ro` dans le container)

**Règle :** toute modification d'un guide dans `docs/` doit être copiée dans `frontend/docs/` :
```bash
cp docs/guide-XX-*.md frontend/docs/
cp docs/guide-XX-*.fr.md frontend/docs/
```

**Quand mettre à jour la doc :**
- Nouvelle fonctionnalité visible dans l'UI → mettre à jour le guide correspondant (EN + FR)
- Modification du comportement de l'agent (config, modes de connexion, nouvelles métriques collectées) → mettre à jour `README.md` + `README.fr.md`
- Nouvelle section dans `docs/README.md` si un nouveau guide est créé

**Correspondance features → guides :**
| Feature | Guide à mettre à jour |
|---|---|
| Vue détail système, health score, HANA HSR | guide-03-detail-systeme |
| Agent : connexion, config, systems.yaml | README.md (section Agent) |
| Diff / comparaison snapshots | guide-05-diff |
| Landscape / vue globale | guide-02-landscape |
| Admin utilisateurs/clients/tokens | guide-07, guide-08 |

## Landing page — règle i18n

Tout texte visible ajouté dans `frontend/index.html` doit être internationalisé. Sans exception.

**Règle :** chaque élément contenant du texte utilisateur doit porter :
- `data-i18n="cle"` pour le contenu texte simple
- `data-i18n-html="cle"` pour le contenu HTML (liens, `<strong>`, etc.)

Et la clé correspondante doit être ajoutée dans le bloc `TRANSLATIONS` pour les **3 langues** : `en`, `fr`, `de`.

**Vérification avant commit :** greper `data-i18n` pour s'assurer que tout nouveau contenu textuel est couvert. Si un élément texte n'a pas d'attribut `data-i18n`, c'est un oubli à corriger.

**Exemple correct :**
```html
<span data-i18n="pricing_toggle_monthly">Monthly</span>
```
```js
TRANSLATIONS = {
  en: { pricing_toggle_monthly: "Monthly" },
  fr: { pricing_toggle_monthly: "Mensuel" },
  de: { pricing_toggle_monthly: "Monatlich" },
}
```

## Debugging

When debugging issues, identify the root cause before making changes. Check API response payloads, field name mismatches, and data flow end-to-end rather than investigating broadly with many tool calls.
