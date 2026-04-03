Design the onboarding / empty state page of SAPscope. This is what a new user sees after signing up and paying, before their agent has sent any data.

## Context
The user just subscribed. They need to install the SAPscope agent on their SAP server to start collecting data. This page guides them through the setup.

## Content

### Step 1 — Agent token
- A box showing the agent token (long string, monospace font)
- Copy to clipboard button
- Warning text: "This token will only be shown once. Store it securely."

### Step 2 — Install the agent
Installation command to run on the SAP Linux server:
```
curl -fsSL https://app.sapscope.com/install.sh | bash
```
- Copy button next to the command
- Note: "Run this command as root on the SAP application server"

### Step 3 — Configure environment variables
A code block showing the environment variables to set:
```
SAPSCOPE_BACKEND_URL=https://app.sapscope.com
SAPSCOPE_TOKEN=<your-token>
SAP_USER=SAPSCOPE_RFC
SAP_PASSWD=<password>
```

### Step 4 — Run the agent
```
sapscope-agent
```
- Note: "The agent will connect to SAP via RFC and send a snapshot. It should appear here within 1 minute."

### Waiting state
A pulsing indicator: "Waiting for first snapshot…"
With a "Refresh" button to manually check.

### Help link
"Need help? Read the documentation →"
