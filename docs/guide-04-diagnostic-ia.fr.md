🇬🇧 [English](guide-04-diagnostic-ia.md) | 🇫🇷 Français

# Diagnostic IA

**Durée :** 10 à 30 secondes (génération)

---

## Lancer un diagnostic

1. Ouvrir le **détail d'un système** (cliquer sur un SID dans la sidebar)
2. La section **Diagnostic IA** est affichée en haut de la vue
3. Si aucun diagnostic n'existe encore → cliquer **Générer le diagnostic**
4. Choisir la **langue** souhaitée dans le sélecteur (Français, English, Deutsch…)
5. Patienter pendant la génération (10 à 30 secondes)

---

## Relancer un diagnostic

Un diagnostic est mis en cache. Pour forcer une nouvelle analyse :
- Cliquer **Regénérer** (remplace le diagnostic existant)

> Utile après une collecte fraîche ou un changement de kernel/SP.

---

## Ce que le diagnostic contient

- **Résumé de l'état du système** (kernel, composants principaux, niveau de patch)
- **Points d'attention** identifiés (composants en retard de SP, kernel ancien, etc.)
- **Recommandations** actionnables pour le consultant Basis
- **Analyse des objets custom** si présents (volume, types)

---

## Exporter le diagnostic

Cliquer **Imprimer / Exporter PDF** pour générer un rapport PDF complet incluant :
- Informations système
- Tableau des composants
- Tableau des support packages
- Diagnostic IA
- Objets custom ABAP

> Le PDF s'ouvre dans un nouvel onglet → utiliser **Ctrl+P** / **Cmd+P** pour imprimer ou sauvegarder.

---

## Problèmes courants

| Symptôme | Cause | Solution |
|---|---|---|
| Génération bloquée | Timeout API Claude | Réessayer dans quelques secondes |
| Diagnostic en anglais malgré choix Français | Langue non sauvegardée | Sélectionner à nouveau et regénérer |
