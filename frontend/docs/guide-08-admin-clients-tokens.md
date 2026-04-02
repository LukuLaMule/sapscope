🇬🇧 English | 🇫🇷 [Français](guide-08-admin-clients-tokens.fr.md)

# Administration — Clients and Ingestion Tokens

**Access:** Admin account only

---

## Concepts

- **Client** = a company (e.g. ACME Industries). Groups all its SAP systems.
- **Token** = authentication key used by the collection agent to send snapshots to SAPscope.

---

## Create a client

1. **⚙ admin** → **Clients** tab
2. Click **New client**
3. Enter the **client name** → confirm

The client appears in the list. It stays empty until the first snapshot is sent.

```bash
# Direct API
curl -X POST "https://app.sapscope.com/api/v1/admin/clients?name=ACME%20Industries" \
  -H "Authorization: Bearer <admin_token>"
```

---

## Generate an ingestion token

1. In the client list → click the relevant client
2. **Tokens** section → click **New token**
3. Enter a **label** (e.g. `agent-prd`, `agent-dev`) → confirm
4. **Copy the token immediately** — it is only shown once

```bash
# Direct API
curl -X POST "https://app.sapscope.com/api/v1/admin/clients/<client_id>/tokens?label=agent-prd" \
  -H "Authorization: Bearer <admin_token>"
```

> This token is then passed to the collection agent during installation on the client side.

---

## Use the token in the agent

When installing the agent on the client server:

```bash
sudo bash install.sh --token <ingestion_token> --sap-pass <SAPSCOPE-password>
```

---

## List tokens for a client

```bash
curl https://app.sapscope.com/api/v1/admin/clients/<client_id>/tokens \
  -H "Authorization: Bearer <admin_token>"
```

---

## Revoke a token

1. In the client profile → **Tokens** section
2. Click **Revoke** next to the relevant token → confirm

The agent using this token will no longer be able to send snapshots. Generate a new token and reconfigure the agent if needed.

```bash
# Direct API
curl -X DELETE https://app.sapscope.com/api/v1/admin/clients/<client_id>/tokens/<token_id> \
  -H "Authorization: Bearer <admin_token>"
```

---

## Best practices

| Situation | Recommendation |
|---|---|
| One token per environment | `agent-dev`, `agent-qas`, `agent-prd` — easier to track |
| End of engagement | Revoke the token as soon as the contract ends |
| Compromised token | Revoke immediately and generate a new one |
