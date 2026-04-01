# Vue détail d'un système SAP

**Durée :** 1 à 2 minutes

---

## Accéder au détail d'un système

1. Dans la sidebar, cliquer sur le **SID** du système souhaité
2. La zone principale affiche le snapshot le plus récent

---

## Contenu affiché

### Informations système
- SID, hôte, kernel, base de données
- Date et heure de la collecte

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
