🇬🇧 [English](guide-11-notes.md) | 🇫🇷 Français

# Notes par système

**Accès :** Admin ou consultant assigné au client

---

## Objectif

Les notes permettent aux consultants de laisser des observations en texte libre sur un système SAP spécifique — remarques lors d'une revue, points d'action, commentaires de version, etc. Les notes sont stockées dans SAPscope et visibles par tous les utilisateurs ayant accès au client.

---

## Où trouver les notes

Ouvrir la page de détail d'un système (cliquer sur une carte système dans la vue Landscape, ou sur une ligne dans l'Inventaire). La section **Notes** se trouve dans la colonne droite.

---

## Ajouter une note

1. Saisir le texte dans la zone de texte en bas de la section Notes
2. Cliquer sur **Add Note**

La note est enregistrée avec votre email et l'horodatage.

---

## Modifier une note

Seul l'auteur peut modifier sa propre note (les admins peuvent modifier n'importe quelle note).

1. Cliquer sur l'**icône crayon** à côté de la note
2. Modifier le texte dans l'éditeur inline
3. Cliquer sur **Save** — ou **Cancel** pour annuler

---

## Supprimer une note

Cliquer sur l'**icône poubelle** à côté de la note. La suppression est immédiate (pas de confirmation).

Seul l'auteur peut supprimer sa propre note. Les admins peuvent supprimer toute note.

---

## Les notes sont par système

Les notes sont rattachées à une paire `(client, SID)`. Le même SID chez un autre client possède ses propres notes distinctes.

---

## FAQ

**Les notes sont-elles incluses dans le rapport PDF ?**
Pas actuellement — le rapport se concentre sur les données de santé technique.

**Les notes sont-elles visibles par tous les utilisateurs du client ?**
Oui — tout utilisateur ayant accès au client (admin ou consultant assigné) peut lire toutes les notes de ses systèmes.

**Y a-t-il une limite de caractères ?**
Oui — 4 000 caractères par note.
