🇬🇧 [English](guide-01-connexion.md) | 🇫🇷 Français

# Connexion

**Durée :** 1 minute

---

## Connexion standard

1. Ouvrir SAPscope dans le navigateur
2. Saisir **email** et **mot de passe**
3. Cliquer **Se connecter**

> Le champ mot de passe dispose d'un bouton **afficher/masquer** (icône œil à droite).

---

## Créer un compte

1. Cliquer **S'inscrire** sous le formulaire
2. Saisir un email professionnel
3. Saisir un mot de passe **(12 caractères minimum)**
4. Confirmer le mot de passe → **Créer mon compte →**

> Le compte est immédiatement actif. Un admin doit ensuite vous assigner un ou plusieurs clients.

---

## Mot de passe oublié

1. Cliquer **Mot de passe oublié ?** sous le bouton de connexion
2. Saisir votre adresse email et cliquer **Envoyer le lien**
3. Vérifier votre boîte de réception — un lien de réinitialisation valable **1 heure** est envoyé
4. Cliquer le lien → saisir et confirmer le nouveau mot de passe → **Mettre à jour**

> Par sécurité, la confirmation s'affiche toujours, que l'adresse soit enregistrée ou non.

---

## Compte de démonstration

| Email | Mot de passe |
|---|---|
| `demo@sapscope.com` | `SAPscope2026!` |

Donne accès aux clients de démo (Demo, ACME Industries) en lecture seule.

---

## Problèmes courants

| Symptôme | Cause probable | Solution |
|---|---|---|
| "Invalid credentials" | Mauvais mot de passe | Vérifier la casse |
| Connexion réussie mais aucun système visible | Aucun client assigné | Demander à l'admin d'assigner un client |
| Session expirée | Token JWT expiré | Se reconnecter |
| Lien de réinitialisation non reçu | Email dans les spams, ou adresse non enregistrée | Vérifier les spams |
