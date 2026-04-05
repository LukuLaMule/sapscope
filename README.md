🇬🇧 English | 🇫🇷 [Français](README.fr.md)

# SAPscope

SAP landscape monitoring and diagnostic tool. Automatically collects metadata from your systems (components, support packages, kernel, custom objects) and generates AI-powered analyses.

Two deployment modes: **SaaS** (hosted at sapscope.com) and **self-hosted** (on your own infrastructure).

---

## SaaS — Quick start

1. Create an account at [app.sapscope.com](https://app.sapscope.com/app)
2. Contact [contact@sapscope.com](mailto:contact@sapscope.com) to activate your scope
3. An administrator creates your SAP client, generates an agent token and sends it to you
4. Install the agent on your SAP server (see Agent section below)

---

## Self-hosted — Deployment

### Prerequisites

- Docker + Docker Compose
- A SAPscope licence key (contact [contact@sapscope.com](mailto:contact@sapscope.com))
- An Anthropic API key
- A reverse proxy with TLS (Traefik, nginx, Caddy…)

### Installation

```bash
git clone <repo> sapscope
cd sapscope
cp .env.example .env
```

Fill in `.env`:

```env
POSTGRES_PASSWORD=changeme
SAPSCOPE_JWT_SECRET=a-random-string-of-at-least-32-characters
ANTHROPIC_API_KEY=sk-ant-...
LICENSE_KEY=<your-licence-key>
REGISTRATION_ENABLED=false
ALLOWED_ORIGINS=https://your-domain.com
```

Start:

```bash
docker compose up -d
```

### First start

Create the administrator account via the API (one-time):

```bash
# Temporarily enable registration
# Set REGISTRATION_ENABLED=true in .env, then restart the backend

curl -X POST https://your-domain.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@your-company.com","password":"secure-password"}'

# Retrieve the user ID from the response, then grant admin rights:
docker compose exec db psql -U sapscope -c \
  "UPDATE users SET is_admin = true WHERE email = 'admin@your-company.com';"

# Set REGISTRATION_ENABLED=false again and restart
```

### Generate a licence (vendors only)

```bash
cd backend
python generate_license.py --org "Client name" --tier enterprise --months 12
```

The private key must be in `backend/sapscope_license.pem` (not versioned — keep it safe).

Available tiers:

| Tier       | Users    | SAP Clients |
|------------|----------|-------------|
| solo       | 1        | 3           |
| team       | 5        | 20          |
| enterprise | unlimited | unlimited  |

---

## SAP Agent

The agent is deployed on the SAP application server. It connects via local RFC and sends a snapshot every 24 hours.

### Installation

Run the installer on the SAP application server (Linux, requires root):

```bash
curl -sSL https://app.sapscope.com/install.sh | sudo bash -s -- \
  --token <token-from-admin-panel>
```

The installer will:
- Detect Python (install if needed)
- Auto-discover SAP systems from `/usr/sap/`
- Create a systemd timer for automatic collection
- Run a first collection immediately

#### Manual installation (without the installer)

```bash
curl -O https://app.sapscope.com/dist/agent.tar.gz
curl -O https://app.sapscope.com/dist/agent.tar.gz.sha256
sha256sum --check agent.tar.gz.sha256
tar xzf agent.tar.gz && cd agent
pip install -r requirements.txt
```

Create a `.env` file:

```env
SAPSCOPE_BACKEND_URL=https://app.sapscope.com
SAPSCOPE_TOKEN=<token-from-admin-panel>
SAP_USER=SAPSCOPE_RFC
SAP_PASSWD=<password>
SAP_CLIENT=100
```

Test and run:

```bash
python -m agent --dry-run   # check RFC connection, print JSON
python -m agent             # collect and send
```

### Required RFC user on the SAP side

See [docs/sap-rfc-user-setup.md](docs/sap-rfc-user-setup.md) for creating the communication user and the minimum required authorisations.

---

## Testing the agent locally (SAP ABAP Trial)

You can test the full collection pipeline against a free SAP ABAP trial system running on your machine.

### 1 — Start an SAP ABAP Trial container

Requires: Docker, 8 GB RAM, ~150 GB disk, [SAP Universal ID](https://account.sap.com) (free).

```bash
docker login   # authenticate with your SAP Universal ID
docker pull sapse/abap-platform-trial:1909

docker run -d \
  --name sap-trial \
  --hostname vhcalnplci \
  --stop-timeout 3600 \
  -p 3200:3200 -p 8443:8443 \
  sapse/abap-platform-trial:1909

# Follow the boot (takes ~45 min on first run)
docker logs -f sap-trial | grep -E "started|ICM|Dispatcher"
```

Default logon: host `localhost`, system number `00`, client `001`, user `DEVELOPER`, password `ABAPtr1909`.

### 2 — Install the SAP NW RFC SDK

Download **SAP NW RFC SDK 7.50** (Linux 64-bit) from [SAP Software Downloads](https://support.sap.com/swdc) (S-User required).

```bash
unzip nwrfc750*.zip -d /usr/local/sap
export SAPNWRFC_HOME=/usr/local/sap/nwrfc750
echo 'export SAPNWRFC_HOME=/usr/local/sap/nwrfc750' >> ~/.bashrc
```

### 3 — Install agent dependencies

```bash
cd agent
pip install -r requirements.txt   # includes pyrfc
```

### 4 — Setup the RFC user in SAP

- **SE38** → create and execute program `ZSAPSCOPE_SETUP` (source: `docs/ZSAPSCOPE_SETUP.abap`)
- **SU01** → create user `SAPSCOPE` following `docs/sap-rfc-user-setup.md`

### 5 — Run the agent in dry-run mode

```bash
SAPSCOPE_BACKEND_URL=https://app.sapscope.com \
SAPSCOPE_TOKEN=<token-from-admin-panel> \
SAP_USER=SAPSCOPE \
SAP_PASSWD=<password> \
SAP_HOST=localhost \
SAP_SYSNR=00 \
SAP_CLIENT=001 \
SAPSCOPE_SYSTEMS="NPL:00" \
python -m agent --dry-run   # prints collected JSON, does not send
```

Remove `--dry-run` to send the snapshot to the backend and see it appear in the UI.

---

## Administration

From the web interface (Admin tab, visible only for `is_admin` accounts):

- **Clients**: create an SAP scope, generate agent tokens, revoke tokens
- **Users**: create consultant accounts, assign the clients visible to each consultant

---

## Environment variables

| Variable              | Required | Description                                                  |
|-----------------------|----------|--------------------------------------------------------------|
| `DATABASE_URL`        | yes      | asyncpg PostgreSQL URL                                       |
| `SAPSCOPE_JWT_SECRET` | yes      | JWT secret (min. 32 characters)                              |
| `ANTHROPIC_API_KEY`   | yes      | Anthropic API key for analyses                               |
| `LICENSE_KEY`         | self-hosted | Licence JWT signed by SAPscope                           |
| `REGISTRATION_ENABLED`| no       | `true` (SaaS) / `false` (self-hosted). Default: `true`       |
| `ALLOWED_ORIGINS`     | no       | Allowed CORS origins. Default: `https://app.sapscope.com`     |
| `ENV`                 | no       | `development` enables SQL logs and `/docs`. Default: `production` |

---

## Healthcheck

```bash
curl https://your-domain.com/healthz
```

---

## Licence

Proprietary software — © 2026 SAPscope. All rights reserved.
Any redistribution or modification without written permission is prohibited.
