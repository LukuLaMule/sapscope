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

### Dimensionnement système
Analyse automatique du dimensionnement basée sur les paramètres de profil (RZ10/RZ11) et les métriques mémoire HANA :
- Nombre de work processes (dialog, background, spool, update)
- Extended memory (EM)
- Utilisation et limite d'allocation mémoire HANA

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

> Utiliser la **barre de recherche** au-dessus du tableau pour filtrer.

### Support Packages appliqués
Liste des patches appliqués avec :
- Composant concerné
- Numéro de patch
- Type
- Date d'application

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
