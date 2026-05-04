🇬🇧 [English](guide-03-detail-systeme.md) | 🇫🇷 Français

# Vue détail d'un système SAP

**Durée :** 1 à 2 minutes

---

## Accéder au détail d'un système

1. Dans la sidebar, cliquer sur le **SID** du système souhaité
2. La zone principale affiche le snapshot le plus récent

---

## Contenu affiché

### Informations système
- SID, hôte, kernel, type de base de données
- Date et heure de la collecte

### Health Score Breakdown
Score par domaine (0–100) avec indicateurs individuels :

| Domaine | Ce qu'il mesure |
|---|---|
| Stability | Dumps ABAP (ST22) + jobs abortés (SM37) — 7 derniers jours |
| Performance | Work processes en état PRIV ou Stopped |
| Connectivity | Erreurs tRFC/qRFC (ARFCSSTATE) |
| Infrastructure | Taux de remplissage des tablespaces (Oracle/DB2) |
| Security | Comptes utilisateurs verrouillés |
| Security Ops | Utilisateurs par défaut actifs (SAP\*, DDIC), détenteurs de SAP_ALL, RFC sans logon |
| Transports | Taille de la queue d'import (STMS) |
| HANA Replication | Statut de réplication HSR — visible uniquement sur les systèmes HANA avec HSR configuré |
| Certificates | Expiration des certificats SSL/TLS (PSEs ABAP via STRUST + HANA M\_PSE\_CERTIFICATES) — visible uniquement si les PSEs sont lisibles |

Les domaines sont inclus dans le score uniquement si les données sont disponibles. Les domaines absents sont exclus de la moyenne pondérée.

### Dimensionnement système
Analyse automatique du dimensionnement basée sur les paramètres de profil (RZ10/RZ11) et les métriques mémoire HANA :
- Nombre de work processes (dialog, background, spool, update)
- Extended memory (EM)
- Utilisation et limite d'allocation mémoire HANA

### Certificats SSL/TLS
Visible quand l'agent peut lire les PSEs via `SSFR_PSE_LIST` / `SSFR_PSE_GET` (ABAP) ou `M_PSE_CERTIFICATES` (HANA).

| Statut | Signification |
|---|---|
| `OK` | Certificat valide plus de 30 jours |
| `WARNING` | Expire dans 7–30 jours |
| `CRITICAL` | Expire dans moins de 7 jours |
| `EXPIRED` | Déjà expiré |

Les certificats sont triés par date d'expiration (les plus urgents en premier). Le CN du sujet et le contexte PSE (ex. `SSLS/` pour le certificat serveur ICM) sont affichés pour chaque entrée.

### Réplication système HANA (HSR)
Visible uniquement sur les systèmes HANA où HSR est configuré.

| Champ | Description |
|---|---|
| Statut | `ACTIVE` (vert), `SYNCING` / `INITIALIZING` (orange), autre (rouge) |
| Mode | `SYNC`, `ASYNC`, ou `SYNCMEM` |
| Sites | Nom du site primaire → secondaire et nom d'hôte |

> Un statut `ACTIVE` signifie que la réplication fonctionne normalement. Tout autre statut est signalé dans le Health Score Breakdown sous le domaine **HANA Replication**.

### Composants installés
Tableau complet des composants SAP avec :
- Nom du composant
- Release
- SP Level (niveau Support Package)
- Description

### Support Packages appliqués
Liste des patches appliqués avec :
- Composant concerné
- Numéro de patch
- Type
- Date d'application

### Sécurité étendue
En plus des indicateurs classiques (SAP_ALL, RFC sans logon, comptes par défaut), trois métriques supplémentaires sont affichées si leur valeur est non nulle :

| Indicateur | Signification | Seuil warning |
|---|---|---|
| Utilisateurs inactifs (>90j) | Comptes actifs sans connexion depuis plus de 90 jours | > 20 |
| Jamais connectés | Comptes actifs qui ne se sont jamais connectés | > 10 |
| Profil SAP_NEW | Utilisateurs avec SAP_NEW (quasi-équivalent SAP_ALL) | tout nombre > 0 |

Ces métriques impactent le score du domaine **Security Ops**.

### Positionnement vs portefeuille (Benchmarks)
Compare les métriques clés du système contre la moyenne de tous les systèmes du **même tier** dans l'instance SAPscope.

Pour chaque métrique (dumps, jobs abortés, WP privés, erreurs RFC, queue transport, SAP_ALL) :
- **Barre comparative** : la position de la valeur du système par rapport à la moyenne du tier
- **Ratio coloré** : vert si ≤ 1.2×, orange si 1.2–2.5×, rouge si > 2.5× la moyenne
- **Badge** : "Dans la norme" / "Au-dessus" / "Critique"

> Nécessite au moins 2 systèmes du même tier dans l'instance pour afficher un benchmark.

### Tendances & prédictions
Analyse l'évolution des métriques sur les **30 derniers snapshots** collectés. Pour chaque métrique surveillée :

| Icône | Signification |
|---|---|
| ↑ (rouge) | Tendance à la hausse, seuil en approche |
| ↓ (vert) | Tendance à la baisse, situation s'améliore |
| → (gris) | Stable, pas d'évolution significative |

Si la tendance est à la hausse et qu'un seuil critique est défini, un badge indique l'échéance estimée :
- **"CRITIQUE dans X jours"** (rouge) — seuil atteint en moins de 7 jours
- **"ATTENTION dans X jours"** (orange) — seuil atteint en moins de 30 jours

> Nécessite un minimum de 3 snapshots pour calculer une tendance.

### Rapport de conformité PDF
Bouton **"Rapport conformité"** (icône bouclier) dans le header de la page.

Génère un PDF téléchargeable (`compliance-{SID}-{date}.pdf`) avec 10 contrôles basés sur le **SAP Security Guide** :

| Contrôle | Catégorie | Sévérité si non-conforme |
|---|---|---|
| SEC-001 | Comptes par défaut | SAP* désactivé | CRITIQUE |
| SEC-002 | Comptes par défaut | DDIC désactivé | CRITIQUE |
| SEC-003 | Comptes par défaut | EARLYWATCH désactivé | ÉLEVÉ |
| SEC-004 | Autorisations | Aucun SAP_ALL | CRITIQUE |
| SEC-005 | Autorisations | Aucun SAP_NEW | ÉLEVÉ |
| SEC-006 | Connexions RFC | RFC type-3 avec utilisateur défini | ÉLEVÉ |
| SEC-007 | Connexions RFC | Connexions de confiance < 5 | MOYEN |
| SEC-008 | Gestion comptes | Inactifs >90j < 20 | MOYEN |
| SEC-009 | Gestion comptes | Jamais connectés < 10 | MOYEN |
| SEC-010 | Gestion comptes | Comptes verrouillés < 50% | BAS |

Le rapport affiche un résumé CRITIQUE / ÉLEVÉ / MOYEN / BAS / CONFORME et le détail de chaque contrôle.

### Objets custom ABAP
Graphique donut + tableau des développements Z/Y :
- Répartition par type (programme, fonction, classe, table, etc.)
- Nombre total d'objets custom

---

## Filtrer les données

Chaque tableau dispose d'une barre de recherche : taper un terme filtre les résultats en temps réel.

---

## Naviguer dans l'historique

Si le système a plusieurs snapshots, une **ligne Historique** apparaît sous le titre :
- Cliquer sur une **date** pour charger ce snapshot
- Cliquer sur **↔** pour comparer deux snapshots (voir guide Diff)
