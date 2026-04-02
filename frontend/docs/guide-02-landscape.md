🇬🇧 English | 🇫🇷 [Français](guide-02-landscape.fr.md)

# Landscape View — SAP System Overview

**Duration:** 30 seconds

---

## Access the Landscape view

1. Log in to SAPscope
2. Select a **client** from the dropdown (top bar)
3. Click **⊞ LANDSCAPE** at the top of the left sidebar

---

## What the view shows

- **All SAP systems** for the client on a single page (one card per SID)
- For each system:
  - SID + host
  - Number of components
  - Date of the last snapshot
  - **⚠ agent inactive** badge if the last collection is more than 24h old

---

## Switch client

Use the **dropdown menu** in the top bar — the system list updates automatically.

---

## Indicators to watch

| Indicator | Meaning | Action |
|---|---|---|
| **⚠ agent inactive** badge | Agent has not collected in >24h | Check that the agent service is running on the client server |
| No systems displayed | Client has no snapshot yet | Run a first collection via the agent |
