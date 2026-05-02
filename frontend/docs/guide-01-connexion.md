🇬🇧 English | 🇫🇷 [Français](guide-01-connexion.fr.md)

# Login

**Duration:** 1 minute

---

## Standard login

1. Open SAPscope in your browser
2. Enter your **email** and **password**
3. Click **Se connecter**

> The password field has a **show/hide** toggle (eye icon on the right).

---

## Create an account

1. Click **Sign up** below the login form
2. Enter a professional email address
3. Enter a password **(minimum 12 characters)**
4. Confirm the password → **Create my account →**

> The account is active immediately. An admin must then assign one or more clients to you.

---

## Forgot your password?

1. Click **Mot de passe oublié ?** below the login button
2. Enter your email address and click **Envoyer le lien**
3. Check your inbox — you will receive a reset link valid for **1 hour**
4. Click the link → enter and confirm your new password → **Mettre à jour**

> For security, the page always confirms the email was sent regardless of whether the address is registered.

---

## Demo account

| Email | Password |
|---|---|
| `demo@sapscope.com` | `SAPscope2026!` |

Gives read-only access to demo clients (Demo, ACME Industries).

---

## Common issues

| Symptom | Likely cause | Solution |
|---|---|---|
| "Invalid credentials" | Wrong password | Check case sensitivity |
| Login succeeds but no systems visible | No client assigned | Ask admin to assign a client |
| Session expired | JWT token expired | Log in again |
| Reset link not received | Email in spam, or address not registered | Check spam folder |
