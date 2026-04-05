🇬🇧 [English](guide-10-inventory.md) | 🇫🇷 Français

# Inventaire global

**Accès :** Tous les utilisateurs connectés (les admins voient tous les clients, les consultants uniquement leurs clients assignés)

---

## Objectif

La vue **Inventaire** affiche un tableau plat de tous les systèmes SAP, tous clients confondus. Elle permet d'avoir en un coup d'œil les versions, la santé des kernels et le statut général — sans naviguer dans chaque paysage individuellement.

---

## Ouvrir l'inventaire

Cliquer sur **Inventory** dans la barre latérale gauche (icône tableau).

---

## Colonnes du tableau

| Colonne | Description |
|---|---|
| Client | Entreprise à laquelle appartient le système |
| SID | Identifiant du système SAP |
| Tier | Production / Qualité / Développement / … |
| Release | Version SAP (ex. `S4HANA 2023`) |
| Kernel | Version du kernel + **badge d'obsolescence** |
| BASIS SP | Niveau de Support Package du composant SAP_BASIS |
| DB | Type de base de données |
| Score | Score de santé 0–100 (coloré) |
| Status | OK / WARNING / CRITICAL |
| Snapshot | Ancienneté du dernier snapshot |

---

## Badges d'obsolescence du kernel

SAPscope compare la version kernel aux releases long-terme maintenance connues de SAP :

| Badge | Signification |
|---|---|
| **Current** (vert) | Kernel ≥ 785 — release LTM actuelle |
| **Outdated** (orange) | Kernel 777–784 — encore supporté mais pas le plus récent |
| **Obsolete** (rouge) | Kernel < 777 — hors maintenance standard |

> Ces badges apparaissent aussi sur les cartes système de la vue Landscape.

---

## Filtres et recherche

- **Barre de recherche** — filtrer par SID, nom de client ou release SAP
- **Menu client** — restreindre à un seul client
- **Menu statut** — afficher uniquement les systèmes OK, WARNING ou CRITICAL

---

## Tri

Cliquer sur l'en-tête d'une colonne pour trier par ordre croissant ; recliquer pour l'ordre décroissant.

---

## Export CSV

Cliquer sur **Export CSV** pour télécharger la vue filtrée en cours au format tableur.

Colonnes exportées : Client, SID, Tier, SAP Release, Kernel, Kernel Status, BASIS SP, Database, Health Score, Status, Last Snapshot.
