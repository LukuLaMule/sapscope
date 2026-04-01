🇬🇧 English | 🇫🇷 [Français](guide-07-admin-utilisateurs.fr.md)

# Administration — Users

**Access:** Admin account only

---

## Open the administration panel

1. Log in with an admin account
2. Click **⚙ admin** in the top bar
3. The **Users** tab is selected by default

---

## Create a user

1. In the **Users** tab → click **New user**
2. Enter the consultant's **email**
3. Enter a **temporary password**
4. Confirm → the user appears in the list

> The user can change their password from their profile.

---

## Assign a client to a user

1. In the user list, click the relevant user
2. In the **Assigned clients** section → click **Assign**
3. Select the client from the list → confirm

The user can now see this client in their dropdown menu.

---

## Remove access to a client

1. In the user profile → **Assigned clients** section
2. Click **✕** next to the relevant client → confirm

---

## Delete a user

1. In the user list → click **Delete** next to the user
2. Confirm deletion

> Deletion is immediate and irreversible. The client's snapshots are not affected.

---

## Direct API (for automation)

```bash
# Create a user
curl -X POST https://sapscope.luku.fr/api/v1/admin/users \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "consultant@firm.com", "password": "password123"}'

# Assign a client to a user
curl -X POST https://sapscope.luku.fr/api/v1/admin/users/<user_id>/clients/<client_id> \
  -H "Authorization: Bearer <admin_token>"

# Remove a client from a user
curl -X DELETE https://sapscope.luku.fr/api/v1/admin/users/<user_id>/clients/<client_id> \
  -H "Authorization: Bearer <admin_token>"
```
