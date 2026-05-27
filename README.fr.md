🇬🇧 [English](README.md) | 🇫🇷 Français

[![GitHub stars](https://img.shields.io/github/stars/LukuLaMule/sapscope?style=flat-square)](https://github.com/LukuLaMule/sapscope/stargazers)
[![CI](https://github.com/LukuLaMule/sapscope/actions/workflows/ci.yml/badge.svg)](https://github.com/LukuLaMule/sapscope/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-Source%20Available-blue?style=flat-square)](LICENSE)
[![Docker](https://img.shields.io/badge/déploiement-Docker%20Compose-2496ED?style=flat-square&logo=docker)](deploy/)
[![Python](https://img.shields.io/badge/python-3.12-3776AB?style=flat-square&logo=python)](backend/)

# SAPscope

> **Surveillance de paysage SAP par intelligence artificielle, pour consultants Basis.**  
> Collecte RFC + diagnostics automatisés + rapports PDF. Self-hosted. Déployez en 5 minutes.

Vos données SAP ne quittent jamais votre infrastructure — SAPscope tourne entièrement sur vos propres serveurs.

---

## Pourquoi SAPscope ?

Si vous êtes consultant Basis, vous connaissez la routine :

- Ouvrir SM51, SM50, ST22, SM21, SPAM, SM37, STMS l'un après l'autre pour reconstituer l'état d'un système
- Rédiger manuellement des rapports de situation Word/Excel pour vos clients
- Réaliser 3 mois plus tard qu'un écart de support packages s'est creusé

SAPscope automatise tout ça. Un agent Python léger tourne sur n'importe quel serveur avec accès RFC, collecte un snapshot technique complet toutes les 24h, et l'injecte dans un moteur d'analyse IA qui génère des diagnostics structurés avec recommandations priorisées.

---

## Fonctionnalités

| | Fonctionnalité | Ce qu'elle remplace |
|---|---|---|
| 🗺️ | **Vue landscape** | Tour manuel SM51 + vue domaine STMS |
| 🤖 | **Diagnostics IA** | Rédaction de rapports de situation à la main |
| 📊 | **Score de santé** | 6 domaines — Stabilité, Perfs, Connectivité, Infrastructure, Sécurité, Transports |
| 🔄 | **Diff de snapshots** | Comparaisons avant/après manuelles |
| 🔄 | **Diff cross-systèmes** | Comparaison PRD vs QAS composant par composant |
| 📈 | **Tendances prédictives** | Alertes "CRITIQUE dans 7 jours" avant les incidents |
| 📉 | **Benchmarks cross-tier** | Mon système est-il dans la moyenne de son tier ? |
| 🔐 | **Vérifications sécurité** | Détection SAP_ALL, SAP_NEW, users inactifs, users défaut |
| 📄 | **Rapports PDF clients** | Auto-générés, planifiés, white-label avec logo client |
| ✅ | **Rapport conformité** | 10 checks du SAP Security Guide (SEC-001 à SEC-010) |
| 💓 | **Heartbeat agent** | Détection automatique de systèmes décommissionnés |
| 🌐 | **Monitoring HANA HSR** | M_SYSTEM_REPLICATION — lag, mode, statut réplication |
| 📱 | **PWA** | Installable sur mobile, fonctionne hors ligne |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Votre infrastructure                                │
│                                                      │
│  ┌─────────────────┐     ┌────────────────────────┐ │
│  │  Serveur(s) SAP │────▶│  Backend SAPscope      │ │
│  │                 │ RFC │  (FastAPI + PostgreSQL) │ │
│  │  agent pyrfc    │     │                        │ │
│  │  (timer systemd)│     │  Analyse IA (Claude)   │ │
│  └─────────────────┘     └──────────┬─────────────┘ │
│                                      │               │
│                           ┌──────────▼─────────────┐ │
│                           │  Dashboard React       │ │
│                           │  (nginx, via Docker    │ │
│                           │   Compose)             │ │
│                           └────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Stack : **Python 3.12** · **FastAPI** · **PostgreSQL** · **React 18 + TypeScript** · **Anthropic SDK** · **Docker Compose**

---

## Démarrage rapide (self-hosted)

### Prérequis

- Docker + Docker Compose v2
- Une clé API Anthropic ([console.anthropic.com](https://console.anthropic.com))
- Un reverse proxy avec TLS (Traefik, nginx, Caddy…)

### 1 — Cloner et configurer

```bash
git clone https://github.com/LukuLaMule/sapscope.git
cd sapscope
cp deploy/.env.example .env
```

Éditez `.env` (minimum) :

```env
POSTGRES_PASSWORD=a-changer
SAPSCOPE_JWT_SECRET=chaine-aleatoire-32-caracteres-minimum
ANTHROPIC_API_KEY=sk-ant-...
ALLOWED_ORIGINS=https://votre-domaine.com
```

### 2 — Démarrer

```bash
docker compose up -d
```

### 3 — Créer le compte administrateur

```bash
# Activez temporairement l'inscription
# REGISTRATION_ENABLED=true dans .env, puis :
docker compose restart backend

curl -X POST https://votre-domaine.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@votre-entreprise.com","password":"motdepasse-securise-12cars"}'

# Passez-le admin
docker compose exec db psql -U sapscope -c \
  "UPDATE users SET is_admin = true WHERE email = 'admin@votre-entreprise.com';"

# Désactivez l'inscription
# REGISTRATION_ENABLED=false dans .env, puis redémarrez backend
```

### 4 — Installer l'agent SAP

Sur n'importe quel serveur Linux avec accès RFC à votre système SAP :

```bash
# Cloner l'agent
git clone https://github.com/LukuLaMule/sapscope.git
cd sapscope/agent
pip install -r requirements.txt

# Créer .env
cat > .env << EOF
SAPSCOPE_BACKEND_URL=https://votre-domaine.com
SAPSCOPE_TOKEN=<token-depuis-le-panel-admin>
SAP_USER=SAPSCOPE_RFC
SAP_PASSWD=<mot-de-passe>
SAP_CLIENT=100
EOF

# Tester la connexion RFC (dry-run — n'envoie pas de données)
python -m agent --dry-run

# Installer le timer systemd pour la collecte automatique toutes les 24h
sudo cp deploy/sapscope-agent.service /etc/systemd/system/
sudo systemctl enable --now sapscope-agent.timer
```

Guide d'installation complet : [deploy/INSTALL.md](deploy/INSTALL.md)

---

## Agent — Modes de connexion

L'agent se connecte à SAP via RFC sortant sur le port `33XX` — aucun logiciel installé côté SAP, aucune connexion entrante requise.

### `systems.yaml` — recommandé pour les setups multi-systèmes ou distants

```yaml
systems:
  # Connexion directe (agent sur le serveur d'application)
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

### Variable `SAPSCOPE_SYSTEMS` — plusieurs SID locaux sur le même hôte

```env
SAPSCOPE_SYSTEMS=P01:00 Q01:01 D01:02
```

### Priorité de découverte

| Priorité | Source | Cas d'usage |
|---|---|---|
| 1 | `systems.yaml` | Hôtes distants, Message Server, SAProuter |
| 2 | `SAPSCOPE_SYSTEMS` | Plusieurs SID locaux sur le même hôte |
| 3 | Découverte auto `/usr/sap/` | Défaut sur un hôte unique |

### Utilisateur RFC requis

Voir [docs/sap-rfc-user-setup.md](docs/sap-rfc-user-setup.md) — profil d'autorisation en lecture seule minimal. Un programme ABAP de setup `ZSAPSCOPE_SETUP` est fourni.

---

## Test avec un système SAP local

Vous pouvez tester le pipeline complet sur un container SAP ABAP Trial gratuit.

```bash
# Télécharger l'image trial (~150 Go, nécessite un SAP Universal ID)
docker pull sapse/abap-platform-trial:1909
docker run -d --name sap-trial --hostname vhcalnplci \
  --stop-timeout 3600 -p 3200:3200 -p 8443:8443 \
  sapse/abap-platform-trial:1909

# Défaut : host=localhost, sysnr=00, client=001, user=DEVELOPER, pwd=ABAPtr1909

# Installer le NW RFC SDK 7.50 (SAP Software Downloads, S-User requis)
export SAPNWRFC_HOME=/chemin/vers/nwrfc750

# Lancer l'agent en dry-run
SAP_USER=DEVELOPER SAP_PASSWD=ABAPtr1909 \
SAP_HOST=localhost SAP_SYSNR=00 SAP_CLIENT=001 \
SAPSCOPE_BACKEND_URL=https://votre-domaine.com \
SAPSCOPE_TOKEN=<token> \
python -m agent --dry-run
```

---

## Administration

Depuis l'interface web (onglet Admin — comptes `is_admin` uniquement) :

- **Clients** : créer un périmètre SAP, générer des tokens agent, révoquer des tokens
- **Utilisateurs** : créer des comptes consultants, assigner la visibilité clients par utilisateur
- **Statut licence** : vérifier la date d'expiration et le tier actif

---

## Variables d'environnement

| Variable | Requis | Description |
|---|---|---|
| `DATABASE_URL` | oui | URL PostgreSQL asyncpg |
| `SAPSCOPE_JWT_SECRET` | oui | Secret JWT — min. 32 caractères |
| `ANTHROPIC_API_KEY` | oui | Clé API Anthropic pour les analyses IA |
| `REGISTRATION_ENABLED` | non | `true` = inscription ouverte. Défaut : `false` |
| `ALLOWED_ORIGINS` | non | Origines CORS autorisées |
| `ENV` | non | `development` active les logs SQL et `/docs` |
| `IS_LICENSE_SERVER` | non | `true` active les endpoints du serveur de licences |

---

## Healthcheck

```bash
curl https://votre-domaine.com/healthz
```

---

## Contribution

Issues, demandes de fonctionnalités et pull requests bienvenus.  
Voir [CONTRIBUTING.md](CONTRIBUTING.md) et la [Roadmap](ROADMAP.md).

Contact : [pro@luku.fr](mailto:pro@luku.fr)

---

## Licence

Source Available — © 2026 SAPscope (Lucas Lautrec)  
Le déploiement self-hosted et la lecture du code sont autorisés. La redistribution ou la revente sans autorisation écrite sont interdites.  
Voir [LICENSE](LICENSE) pour les détails.
