🇬🇧 [English](guide-02-landscape.md) | 🇫🇷 Français

# Vue Landscape — Vue d'ensemble du paysage SAP

**Durée :** 30 secondes

---

## Accéder à la vue Landscape

1. Se connecter à SAPscope
2. Sélectionner un **client** dans le menu déroulant (barre du haut)
3. Cliquer **⊞ LANDSCAPE** en haut de la sidebar gauche

---

## Ce que la vue affiche

- **Tous les systèmes SAP** du client sur une seule page (une carte par SID)
- Pour chaque système :
  - SID + hôte
  - Nombre de composants
  - Date du dernier snapshot
  - Badge **⚠ agent inactif** si la dernière collecte date de plus de 24h

---

## Changer de client

Utiliser le **menu déroulant** dans la barre du haut — la liste des systèmes se met à jour automatiquement.

---

## Indicateurs à surveiller

| Indicateur | Signification | Action |
|---|---|---|
| Badge **⚠ agent inactif** | L'agent n'a pas collecté depuis >24h | Vérifier que le service agent tourne sur le serveur client |
| Aucun système affiché | Client sans snapshot | Lancer une première collecte via l'agent |
