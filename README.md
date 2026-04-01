🇬🇧 English | 🇫🇷 [Français](README.fr.md)

# SAPscope

SAP landscape monitoring and diagnostic tool. Automatically collects metadata from your systems (components, support packages, kernel, custom objects) and generates AI-powered analyses.

Two deployment modes: **SaaS** (hosted at sapscope.luku.fr) and **self-hosted** (on your own infrastructure).

---

## SaaS — Quick start

1. Create an account at [sapscope.luku.fr/app](https://sapscope.luku.fr/app)
2. Contact [contact@luku.fr](mailto:contact@luku.fr) to activate your scope
3. An administrator creates your SAP client, generates an agent token and sends it to you
4. Install the agent on your SAP server (see Agent section below)

---

## Self-hosted — Deployment

### Prerequisites

- Docker + Docker Compose
- A SAPscope licence key (contact [contact@luku.fr](mailto:contact@luku.fr))
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

```bash
curl -O https://sapscope.luku.fr/dist/agent.tar.gz
tar xzf agent.tar.gz && cd sap-agent
pip install -r requirements.txt
```

Create a `.env` file in the agent folder:

```env
SAPSCOPE_TOKEN=<token-generated-from-admin-panel>
SAPSCOPE_URL=https://sapscope.luku.fr
SAP_HOST=localhost
SAP_SYSNR=00
SAP_CLIENT=100
SAP_USER=SAPSCOPE_RFC
SAP_PASSWORD=<password>
```

Test the connection:

```bash
python agent.py --once
```

Automate with a systemd timer or cron:

```bash
# cron — every day at 2am
0 2 * * * cd /opt/sap-agent && python agent.py --once >> /var/log/sapscope-agent.log 2>&1
```

### Required RFC user on the SAP side

See [docs/sap-rfc-user-setup.md](docs/sap-rfc-user-setup.md) for creating the communication user and the minimum required authorisations.

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
| `ALLOWED_ORIGINS`     | no       | Allowed CORS origins. Default: `https://app.sapscope.io`     |
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
