🇬🇧 [English](guide-09-recovery.md) | 🇫🇷 Français

# Récupération de compte et cas limites

Référence rapide pour tous les scénarios d'authentification et de gestion des utilisateurs.

---

## Matrice des scénarios

| Situation | Solution | Où |
|---|---|---|
| Consultant oublie son mdp | L'admin le reset | Panel admin → Utilisateurs → ↺ pwd |
| Admin oublie son mdp (SaaS) | Contacter `contact@sapscope.com` | — |
| Admin oublie son mdp (self-hosted) | CLI `manage.py reset-password` | Shell serveur |
| User veut changer son propre mdp | Modal changement de mdp | Bouton 🔑 dans la barre du haut |
| Consultant quitte l'entreprise | Supprimer l'user | Panel admin → Utilisateurs → ✕ delete |
| Promouvoir un consultant en admin | Toggle admin | Panel admin → Utilisateurs → ↑ admin |
| Rétrograder un admin | Toggle admin | Panel admin → Utilisateurs → ↓ demote |
| Token agent compromis | Révoquer le token | Panel admin → Clients → Révoquer |
| Session expirée | Se reconnecter | Écran de login |

---

## CLI — Accès d'urgence (self-hosted)

À utiliser quand l'accès à l'interface web est impossible.
À exécuter depuis le dossier `backend/` dans Docker :

```bash
# Lister tous les utilisateurs
docker compose exec backend python manage.py list-users

# Réinitialiser le mot de passe de n'importe quel user (y compris admin)
docker compose exec backend python manage.py reset-password \
  --email admin@example.com --password nouveaumotdepasse123

# Promouvoir un user en admin
docker compose exec backend python manage.py set-admin \
  --email user@example.com --admin true

# Rétrograder un admin en consultant
docker compose exec backend python manage.py set-admin \
  --email user@example.com --admin false

# Supprimer un user (demande confirmation)
docker compose exec backend python manage.py delete-user \
  --email ancienuser@example.com
```

> Toutes les commandes CLI nécessitent que `DATABASE_URL` soit défini (chargé automatiquement depuis `.env`).

---

## Protections anti-blocage

Les actions suivantes sont bloquées pour éviter de se retrouver sans accès :

| Action | Bloquée quand |
|---|---|
| Supprimer un user | C'est le dernier admin |
| Rétrograder un admin | C'est le dernier admin |
| Admin reset son propre mdp via le panel admin | Toujours (utiliser 🔑 à la place) |
| Admin change son propre statut admin | Toujours |

---

## Changer son propre mot de passe (tous les users)

1. Cliquer **🔑** dans la barre du haut
2. Saisir le **mot de passe actuel**
3. Saisir le **nouveau mot de passe** (12 caractères minimum)
4. Confirmer le nouveau mot de passe → **Update password**

---

## Admin : reset le mot de passe d'un consultant

1. **⚙ admin** → onglet **Utilisateurs**
2. Cliquer **↺ pwd** à côté de l'utilisateur
3. Saisir un mot de passe temporaire (12 caractères minimum) → **Save**
4. Communiquer le mot de passe temporaire au consultant de manière sécurisée

---

## Admin : supprimer un utilisateur

1. **⚙ admin** → onglet **Utilisateurs**
2. Cliquer **✕ delete** à côté de l'utilisateur → confirmer

La suppression est immédiate et irréversible. Les clients assignés et leurs snapshots ne sont pas affectés.

---

## Admin : promouvoir / rétrograder

1. **⚙ admin** → onglet **Utilisateurs**
2. Cliquer **↑ admin** pour promouvoir un consultant en admin
3. Cliquer **↓ demote** pour repasser un admin en consultant

Bloqué si l'instance se retrouverait sans aucun admin.
