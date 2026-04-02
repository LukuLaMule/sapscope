🇬🇧 [English](guide-05-diff.md) | 🇫🇷 Français

# Comparaison de snapshots (Diff)

**Durée :** quelques secondes

---

## Quand utiliser le diff ?

- Après une mise à jour kernel ou application de Support Packages → vérifier ce qui a changé
- Avant/après une migration → documenter l'état
- Audit de changements non planifiés

---

## Lancer un diff

1. Ouvrir le **détail d'un système**
2. La **ligne Historique** apparaît si le système a plusieurs snapshots
3. Cliquer sur **↔** à côté d'un snapshot ancien
4. Le diff se calcule et s'affiche immédiatement

> Le snapshot actif (affiché) est comparé au snapshot de la date cliquée.

---

## Ce que le diff affiche

### Changements système
Modifications des paramètres globaux (kernel, base de données, hôte…)

| Paramètre | Avant | Après |
|---|---|---|
| Kernel | 7.53 | 7.54 |

### Composants
- **Ajoutés** (en vert) — nouveaux composants installés
- **Supprimés** (en rouge) — composants désinstallés
- **Modifiés** — changement de SP Level

### Support Packages
- Patches ajoutés, supprimés ou modifiés entre les deux snapshots

### Objets custom ABAP
- Delta du nombre total d'objets (ex : +12 programmes Z)

---

## Revenir à la vue normale

Cliquer sur le système dans la sidebar pour recharger la vue détail standard.
