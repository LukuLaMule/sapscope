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
- Serveur de licences central — `backend/app/routers/license_server.py` + modèle `License` dans `models.py`
  - Activer via `IS_LICENSE_SERVER=true` dans l'env et `app.include_router(license_server.router)` dans `main.py`
  - Endpoints publics : `POST /api/license/validate`, `POST /api/license/activate`
  - Endpoints admin : `POST /api/admin/licenses`, `GET /api/admin/licenses`
  - Plans : `trial` (2 users) | `solo` (1) | `team` (5) | `enterprise` (999)
  - Migration SQL : `backend/migrations/20260429_add_licenses_table.sql`

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

## Debugging

When debugging issues, identify the root cause before making changes. Check API response payloads, field name mismatches, and data flow end-to-end rather than investigating broadly with many tool calls.
