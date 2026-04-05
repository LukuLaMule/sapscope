🇬🇧 [English](guide-12-report.md) | 🇫🇷 Français

# Rapport client (PDF)

**Accès :** Tous les utilisateurs connectés ayant accès au client

---

## Objectif

Le rapport client génère une page HTML prête à imprimer résumant la santé de tous les systèmes SAP d'un client. Il est conçu pour être exporté en PDF et partagé avec le client ou un chef de projet.

---

## Générer un rapport

1. Ouvrir la vue **Landscape** d'un client
2. Cliquer sur **Report PDF** dans la barre d'outils (en haut à droite)
3. Le rapport s'ouvre dans une page dédiée pleine largeur

---

## Imprimer ou exporter en PDF

Sur la page du rapport, cliquer sur **Print / Export PDF** (en haut à droite).

Le dialogue d'impression natif du navigateur s'ouvre. Pour exporter en PDF :
- **Chrome / Edge :** choisir "Enregistrer en PDF" comme destination
- **Firefox :** sélectionner "Imprimer en PDF" dans la liste des imprimantes
- **macOS :** utiliser le bouton PDF en bas à gauche du dialogue d'impression

---

## Contenu du rapport

| Section | Description |
|---|---|
| Couverture | Nom du client, date de génération, nombre total de systèmes |
| Résumé exécutif | Score de santé moyen, compteurs OK / Warning / Critical |
| Vue d'ensemble des systèmes | Tableau complet — SID, tier, release, kernel + badge d'obsolescence, BASIS SP, DB, score, statut, dernier snapshot |
| Systèmes nécessitant attention | Détail par domaine (scores, alertes sécurité) pour les systèmes non-OK uniquement |
| Inventaire des composants | Composants installés par système (15 max par système) |
| Pied de page | Horodatage et nom du client |

---

## FAQ

**Le rapport est-il généré côté serveur ?**
Non — il est rendu dans le navigateur à partir des mêmes données que la vue Landscape, puis imprimé via le moteur PDF du navigateur. Aucune bibliothèque PDF serveur n'est impliquée.

**Le rapport se met-il à jour automatiquement ?**
Non — c'est un instantané des données au moment où la page est ouverte. Rafraîchir la page pour obtenir des données actualisées avant d'imprimer.

**Peut-on inclure les notes dans le rapport ?**
Pas actuellement. Le rapport se concentre sur les données de santé technique.
