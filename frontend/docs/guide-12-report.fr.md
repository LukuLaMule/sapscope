🇬🇧 [English](guide-12-report.md) | 🇫🇷 Français

# Rapport client (PDF)

**Accès :** Tous les utilisateurs connectés ayant accès au client  
**Admin uniquement :** panneau de configuration (planification, destinataires, sections)

---

## Vue d'ensemble

SAPscope génère un rapport PDF professionnel côté serveur (WeasyPrint) pour chaque client. Le rapport couvre tous les systèmes SAP avec scores de santé, détail par domaine, indicateurs clés et analyses IA. Il peut être téléchargé à la demande ou envoyé automatiquement par email selon une planification quotidienne / hebdomadaire / mensuelle.

---

## Télécharger le rapport

1. Ouvrir la page **Rapport** d'un client (accessible depuis la navigation en haut)
2. Cliquer sur **Télécharger PDF** (en haut à droite)
3. Le serveur génère le PDF et le navigateur le télécharge sous le nom `rapport-<client>-<date>.pdf`

Le PDF est généré à partir du dernier snapshot par SID reçu dans les 36 dernières heures.

---

## Contenu du rapport

| Section | Description | Désactivable |
|---|---|---|
| Page de couverture | Nom du client (ou titre personnalisé), score de santé global, nombre de systèmes, date | — |
| Santé par domaine | Score + barre RAG par domaine (Stabilité, Performance, Connectivité, Infrastructure, Sécurité, Transports) | Oui |
| Indicateurs clés | Métriques numériques : dumps ABAP, jobs en erreur, utilisateurs verrouillés, utilisation tablespace, etc. | Oui |
| Analyse IA | Analyse générée par Claude, tronquée à 300 mots | Oui |

---

## Admin : configurer le rapport

Les admins peuvent configurer le rapport pour chaque client depuis le panneau **Admin** → onglet **Clients** → section **Rapports**, ou directement depuis la page Rapport.

### Planification

| Paramètre | Valeurs |
|---|---|
| Activé | Oui / Non |
| Destinataires | Liste d'adresses email |
| Fréquence | Quotidien · Hebdomadaire (choix du jour) · Mensuel (choix du jour 1–28) |
| Langue | Français · Anglais |

### Personnalisation

| Paramètre | Effet |
|---|---|
| Titre du rapport | Affiché en page de couverture à la place du nom du client. Laisser vide pour utiliser le nom du client. |
| Santé par domaine | Inclure / exclure le tableau des scores par domaine |
| Indicateurs clés | Inclure / exclure le tableau des métriques numériques |
| Analyse IA | Inclure / exclure le bloc d'analyse Claude |

### Envoyer maintenant

Cliquer sur **Envoyer maintenant** pour envoyer immédiatement le rapport à tous les destinataires configurés, quelle que soit la planification.

---

## Envoi planifié

Quand activé, SAPscope vérifie toutes les heures si un rapport est dû. Une logique anti-doublon empêche d'envoyer plus d'une fois dans une fenêtre de 20 heures. Le rapport utilise le snapshot le plus récent disponible au moment de l'envoi.

---

## FAQ

**Le PDF est-il généré côté serveur ?**  
Oui — WeasyPrint convertit un template HTML en PDF sur le serveur. Aucun plugin navigateur ni dialogue d'impression n'est nécessaire.

**Que se passe-t-il s'il n'y a pas de snapshot récent ?**  
Les endpoints de téléchargement et d'envoi immédiat retournent une erreur 404 si aucun snapshot n'a été reçu dans les 36 dernières heures.

**Peut-on changer le logo en page de couverture ?**  
Oui — uploader un logo client dans le panneau Admin (onglet Clients → colonne Logo). Il s'affiche en haut à droite de la page de couverture.
