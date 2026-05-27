🇬🇧 English | 🇫🇷 [Français](README.fr.md)

[![GitHub stars](https://img.shields.io/github/stars/LukuLaMule/sapscope?style=flat-square)](https://github.com/LukuLaMule/sapscope/stargazers)
[![CI](https://github.com/LukuLaMule/sapscope/actions/workflows/ci.yml/badge.svg)](https://github.com/LukuLaMule/sapscope/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Source%20Available-blue?style=flat-square)](LICENSE)
[![Docker](https://img.shields.io/badge/deploy-Docker%20Compose-2496ED?style=flat-square&logo=docker)](deploy/)
[![Python](https://img.shields.io/badge/python-3.12-3776AB?style=flat-square&logo=python)](backend/)

# SAPscope

> **AI-powered SAP landscape monitoring for Basis consultants.**  
> RFC collection + automated diagnostics + PDF reports. Self-hosted. Deploy in 5 minutes.

Your SAP data never leaves your infrastructure — SAPscope runs entirely on your own servers.

---

## Why SAPscope?

If you're a Basis consultant, you know the drill:

- Open SM51, SM50, ST22, SM21, SPAM, SM37, STMS one by one to build a picture of a system
- Write manual Word/Excel status reports for clients
- Realize 3 months later that a support package gap opened up

SAPscope automates all of this. A lightweight Python agent runs on any server with RFC access, collects a complete technical snapshot every 24 hours, and feeds it into an AI analysis engine that generates structured diagnostics with prioritized recommendations.

---

## Features

| | Feature | What it replaces |
|---|---|---|
| 🗺️ | **Landscape view** | Manual SM51 + STMS domain overview |
| 🤖 | **AI diagnostics** | Writing status reports by hand |
| 📊 | **Health scoring** | 6 domains — Stability, Performance, Connectivity, Infrastructure, Security, Transports |
| 🔄 | **Snapshot diff** | Manual before/after comparisons |
| 🔄 | **Cross-system diff** | PRD vs QAS side-by-side component comparison |
| 📈 | **Predictive trends** | "CRITICAL in 7 days" warnings before incidents |
| 📉 | **Cross-tier benchmarks** | How does my system compare to others at the same tier? |
| 🔐 | **Security checks** | Detect SAP_ALL, SAP_NEW, inactive users, default users |
| 📄 | **PDF client reports** | Auto-generated, scheduled, white-label with client logo |
| ✅ | **Compliance report** | 10 checks from the SAP Security Guide (SEC-001 to SEC-010) |
| 💓 | **Agent heartbeat** | Detect decommissioned systems automatically |
| 🌐 | **HANA HSR monitoring** | M_SYSTEM_REPLICATION — replication lag, mode, status |
| 📱 | **PWA** | Installable on mobile, works offline |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Your infrastructure                                 │
│                                                      │
│  ┌─────────────────┐     ┌────────────────────────┐ │
│  │  SAP Server(s)  │────▶│  SAPscope Backend      │ │
│  │                 │ RFC │  (FastAPI + PostgreSQL) │ │
│  │  pyrfc agent    │     │                        │ │
│  │  (systemd timer)│     │  AI analysis (Claude)  │ │
│  └─────────────────┘     └──────────┬─────────────┘ │
│                                      │               │
│                           ┌──────────▼─────────────┐ │
│                           │  React dashboard       │ │
│                           │  (nginx, served via    │ │
│                           │   Docker Compose)      │ │
│                           └────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Stack: **Python 3.12** · **FastAPI** · **PostgreSQL** · **React 18 + TypeScript** · **Anthropic SDK** · **Docker Compose**

---

## Quick start (self-hosted)

### Prerequisites

- Docker + Docker Compose v2
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- A reverse proxy with TLS (Traefik, nginx, Caddy…)

### 1 — Clone and configure

```bash
git clone https://github.com/LukuLaMule/sapscope.git
cd sapscope
cp deploy/.env.example .env
```

Edit `.env` (minimum):

```env
POSTGRES_PASSWORD=change-me
SAPSCOPE_JWT_SECRET=at-least-32-random-characters
ANTHROPIC_API_KEY=sk-ant-...
ALLOWED_ORIGINS=https://your-domain.com
```

### 2 — Start

```bash
docker compose up -d
```

### 3 — Create admin account

```bash
# Enable registration temporarily
# Set REGISTRATION_ENABLED=true in .env, then:
docker compose restart backend

curl -X POST https://your-domain.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@your-company.com","password":"secure-password-12chars"}'

# Grant admin rights
docker compose exec db psql -U sapscope -c \
  "UPDATE users SET is_admin = true WHERE email = 'admin@your-company.com';"

# Disable registration
# Set REGISTRATION_ENABLED=false in .env, then restart backend
```

### 4 — Install the SAP agent

On any server with RFC access to your SAP system (Linux):

```bash
# Clone the agent
git clone https://github.com/LukuLaMule/sapscope.git
cd sapscope/agent
pip install -r requirements.txt

# Create .env
cat > .env << EOF
SAPSCOPE_BACKEND_URL=https://your-domain.com
SAPSCOPE_TOKEN=<token-from-admin-panel>
SAP_USER=SAPSCOPE_RFC
SAP_PASSWD=<password>
SAP_CLIENT=100
EOF

# Test RFC connection (dry-run — does not send data)
python -m agent --dry-run

# Install systemd timer for automatic 24h collection
sudo cp deploy/sapscope-agent.service /etc/systemd/system/
sudo systemctl enable --now sapscope-agent.timer
```

See the full installation guide: [deploy/INSTALL.md](deploy/INSTALL.md)

---

## Agent — Connection modes

The agent connects to SAP via outbound RFC on port `33XX` — no software installed on SAP servers, no inbound connection required.

### `systems.yaml` — recommended for multi-system or remote deployments

```yaml
systems:
  # Direct connection (agent on the application server)
  - mode: ashost
    ashost: localhost
    sysnr: "00"
    client: "100"

  # Via Message Server / load balancer
  - mode: mshost
    mshost: sapms.company.com
    msserv: "3601"
    r3name: P01
    group: PUBLIC
    client: "100"

  # Via SAProuter
  - mode: ashost
    ashost: 10.0.1.5
    sysnr: "00"
    saprouter: /H/saprouter.company.com/H/
    client: "000"
```

### `SAPSCOPE_SYSTEMS` env var — multiple local SIDs on the same host

```env
SAPSCOPE_SYSTEMS=P01:00 Q01:01 D01:02
```

### Discovery priority

| Priority | Source | Use case |
|---|---|---|
| 1 | `systems.yaml` | Remote hosts, Message Server, SAProuter |
| 2 | `SAPSCOPE_SYSTEMS` | Multiple local SIDs on same host |
| 3 | Auto-discovery `/usr/sap/` | Single-host default |

### Required RFC user

See [docs/sap-rfc-user-setup.md](docs/sap-rfc-user-setup.md) — minimum read-only authorization profile. An ABAP setup program `ZSAPSCOPE_SETUP` is provided.

---

## Testing with a local SAP system

You can test the full pipeline against a free SAP ABAP Trial container.

```bash
# Pull the trial image (~150 GB, requires SAP Universal ID)
docker pull sapse/abap-platform-trial:1909
docker run -d --name sap-trial --hostname vhcalnplci \
  --stop-timeout 3600 -p 3200:3200 -p 8443:8443 \
  sapse/abap-platform-trial:1909

# Default: host=localhost, sysnr=00, client=001, user=DEVELOPER, password=ABAPtr1909

# Install NW RFC SDK 7.50 (from SAP Software Downloads, S-User required)
export SAPNWRFC_HOME=/path/to/nwrfc750

# Run the agent in dry-run mode
SAP_USER=DEVELOPER SAP_PASSWD=ABAPtr1909 \
SAP_HOST=localhost SAP_SYSNR=00 SAP_CLIENT=001 \
SAPSCOPE_BACKEND_URL=https://your-domain.com \
SAPSCOPE_TOKEN=<token> \
python -m agent --dry-run
```

---

## Administration

From the web interface (Admin tab — `is_admin` accounts only):

- **Clients**: create a SAP scope, generate agent tokens, revoke tokens
- **Users**: create consultant accounts, assign client visibility per user
- **Licence status**: check expiry date and active tier

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | asyncpg PostgreSQL URL |
| `SAPSCOPE_JWT_SECRET` | yes | JWT secret — min. 32 characters |
| `ANTHROPIC_API_KEY` | yes | Anthropic API key for AI analyses |
| `REGISTRATION_ENABLED` | no | `true` = open registration. Default: `false` |
| `ALLOWED_ORIGINS` | no | Allowed CORS origins |
| `ENV` | no | `development` enables SQL logs and `/docs` |
| `IS_LICENSE_SERVER` | no | `true` enables the licence server endpoints |

---

## Healthcheck

```bash
curl https://your-domain.com/healthz
```

---

## Contributing

Issues, feature requests and pull requests are welcome.  
See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Roadmap](ROADMAP.md).

Contact: [pro@luku.fr](mailto:pro@luku.fr)

---

## Licence

Source Available — © 2026 SAPscope (Lucas Lautrec)  
Self-hosted deployment and reading are permitted. Redistribution or resale without written permission is prohibited.  
See [LICENSE](LICENSE) for details.
