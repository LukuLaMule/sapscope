# Administration — Utilisateurs

**Accès :** Compte admin uniquement

---

## Ouvrir le panneau d'administration

1. Se connecter avec un compte admin
2. Cliquer **⚙ admin** dans la barre du haut
3. Onglet **Utilisateurs** sélectionné par défaut

---

## Créer un utilisateur

1. Dans l'onglet **Utilisateurs** → cliquer **Nouvel utilisateur**
2. Saisir l'**email** du consultant
3. Saisir un **mot de passe temporaire**
4. Valider → l'utilisateur apparaît dans la liste

> L'utilisateur peut changer son mot de passe depuis son profil.

---

## Assigner un client à un utilisateur

1. Dans la liste des utilisateurs, cliquer sur l'utilisateur concerné
2. Dans la section **Clients assignés** → cliquer **Assigner**
3. Sélectionner le client dans la liste → confirmer

L'utilisateur voit désormais ce client dans son menu déroulant.

---

## Retirer l'accès à un client

1. Dans la fiche de l'utilisateur → section **Clients assignés**
2. Cliquer **✕** à côté du client concerné → confirmer

---

## Supprimer un utilisateur

1. Dans la liste des utilisateurs → cliquer **Supprimer** à côté de l'utilisateur
2. Confirmer la suppression

> La suppression est immédiate et irréversible. Les snapshots du client ne sont pas affectés.

---

## API directe (pour automatisation)

```bash
# Créer un utilisateur
curl -X POST https://sapscope.luku.fr/api/v1/admin/users \
  -H "Authorization: Bearer <token_admin>" \
  -H "Content-Type: application/json" \
  -d '{"email": "consultant@cabinet.fr", "password": "motdepasse123"}'

# Assigner un client à un utilisateur
curl -X POST https://sapscope.luku.fr/api/v1/admin/users/<user_id>/clients/<client_id> \
  -H "Authorization: Bearer <token_admin>"

# Retirer un client d'un utilisateur
curl -X DELETE https://sapscope.luku.fr/api/v1/admin/users/<user_id>/clients/<client_id> \
  -H "Authorization: Bearer <token_admin>"
```
