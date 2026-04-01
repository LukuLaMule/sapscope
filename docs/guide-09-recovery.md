🇬🇧 English | 🇫🇷 [Français](guide-09-recovery.fr.md)

# Account Recovery & Edge Cases

Quick reference for all authentication and user management scenarios.

---

## Scenario matrix

| Situation | Solution | Where |
|---|---|---|
| Consultant forgets password | Admin resets it | Admin panel → Users → ↺ pwd |
| Admin forgets password (SaaS) | Contact `contact@luku.fr` | — |
| Admin forgets password (self-hosted) | CLI `manage.py reset-password` | Server shell |
| User wants to change own password | Change password modal | 🔑 button in top bar |
| Consultant leaves | Delete user | Admin panel → Users → ✕ delete |
| Promote a consultant to admin | Toggle admin | Admin panel → Users → ↑ admin |
| Demote an admin | Toggle admin | Admin panel → Users → ↓ demote |
| Agent token compromised | Revoke token | Admin panel → Clients → Revoke |
| Session expired | Re-login | Login screen |

---

## CLI — Self-hosted emergency access

Use these commands when locked out of the web interface.
Run from the `backend/` directory inside Docker:

```bash
# List all users
docker compose exec backend python manage.py list-users

# Reset any user's password (including admin)
docker compose exec backend python manage.py reset-password \
  --email admin@example.com --password newpassword123

# Promote a user to admin
docker compose exec backend python manage.py set-admin \
  --email user@example.com --admin true

# Demote an admin to consultant
docker compose exec backend python manage.py set-admin \
  --email user@example.com --admin false

# Delete a user (asks for confirmation)
docker compose exec backend python manage.py delete-user \
  --email olduser@example.com
```

> All CLI commands require `DATABASE_URL` to be set (loaded from `.env` automatically).

---

## Safety guards

The following actions are blocked to prevent lockout:

| Action | Blocked when |
|---|---|
| Delete a user | They are the last admin |
| Demote an admin | They are the last admin |
| Admin resets own password via admin panel | Always (use 🔑 instead) |
| Admin changes own admin status | Always |

---

## Change own password (any user)

1. Click **🔑** in the top bar
2. Enter **current password**
3. Enter **new password** (12 characters minimum)
4. Confirm new password → **Update password**

---

## Admin: reset a consultant's password

1. **⚙ admin** → **Users** tab
2. Click **↺ pwd** next to the user
3. Enter a new temporary password (12 characters minimum) → **Save**
4. Communicate the temporary password to the consultant securely

---

## Admin: delete a user

1. **⚙ admin** → **Users** tab
2. Click **✕ delete** next to the user → confirm

Deletion is immediate and irreversible. Assigned clients and their snapshots are not affected.

---

## Admin: promote / demote

1. **⚙ admin** → **Users** tab
2. Click **↑ admin** to promote a consultant to admin
3. Click **↓ demote** to revert an admin to consultant

Blocked if it would leave the instance with zero admins.
