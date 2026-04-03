Design the administration panel of SAPscope. It opens as a full-screen overlay (modal) on top of the app when an admin clicks the admin button.

## Layout
- Close button top right
- Title "SAPscope — Administration"
- Two tabs: "Users" and "Clients"

---

## Tab: Users

A list of all consultant accounts with:
- Email address
- "admin" badge if the user is an admin
- List of assigned clients (e.g. "ACME Industries, Demo")
- Creation date
- Action buttons per row: Reset password / Toggle admin / Delete

Below the list: "Create user" button → inline form with email + password fields + submit.

Example users:
- pro@luku.fr — admin — ACME Industries, Demo, MLC — created Jan 2026
- consultant@sap.fr — ACME Industries — created Feb 2026
- demo@sapscope.fr — Demo — created Mar 2026

---

## Tab: Clients

A list of clients with:
- Client name
- Creation date
- Number of agent tokens
- "View tokens" expandable section per client
- Delete client button

Per client token section (when expanded):
- List of tokens: label / created date / status (Active or Revoked) / Revoke button
- "Issue new token" button → shows a label input field + generate button
- After generation: the token is shown once in a monospace box with a copy button and a warning "Store this token securely — it will not be shown again"

Example clients:
- ACME Industries — 3 tokens (2 active, 1 revoked) — created Jan 2026
- Demo — 1 token (active) — created Jan 2026
- MLC — 2 tokens (active) — created Feb 2026
