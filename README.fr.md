🇬🇧 [English](README.md) | 🇫🇷 Français

# SAPscope

Outil de surveillance et de diagnostic de paysages SAP. Collecte automatiquement les métadonnées de vos systèmes (composants, support packages, kernel, objets custom) et génère des analyses par intelligence artificielle.

Deux modes de déploiement : **SaaS** (hébergé sur sapscope.com) et **self-hosted** (sur votre infrastructure).

---

## SaaS — Démarrage rapide

1. Créez un compte sur [app.sapscope.com](https://app.sapscope.com/app)
2. Contactez [contact@sapscope.com](mailto:contact@sapscope.com) pour activer votre périmètre
3. Un administrateur crée votre client SAP, génère un token agent et vous l'envoie
4. Installez l'agent sur votre serveur SAP (voir section Agent ci-dessous)

---

## Self-hosted — Déploiement

### Prérequis

- Docker + Docker Compose
- Une clé de licence SAPscope (contactez [contact@sapscope.com](mailto:contact@sapscope.com))
- Une clé API Anthropic
- Un reverse proxy avec TLS (Traefik, nginx, Caddy…)

### Installation

```bash
git clone <repo> sapscope
cd sapscope
cp .env.example .env
```

Remplissez `.env` :

```env
POSTGRES_PASSWORD=changeme
SAPSCOPE_JWT_SECRET=une-chaine-aleatoire-de-32-caracteres-minimum
ANTHROPIC_API_KEY=sk-ant-...
LICENSE_KEY=<votre-cle-de-licence>
REGISTRATION_ENABLED=false
ALLOWED_ORIGINS=https://votre-domaine.com
```

Démarrez :

```bash
docker compose up -d
```

### Premier démarrage

Créez le compte administrateur via l'API (une seule fois) :

```bash
# Activez temporairement l'inscription
# REGISTRATION_ENABLED=true dans .env, puis redémarrez le backend

curl -X POST https://votre-domaine.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@votre-entreprise.com","password":"motdepasse-securise"}'

# Récupérez l'ID utilisateur dans la réponse, puis passez-le admin en base :
docker compose exec db psql -U sapscope -c \
  "UPDATE users SET is_admin = true WHERE email = 'admin@votre-entreprise.com';"

# Remettez REGISTRATION_ENABLED=false et redémarrez
```

### Générer une licence (vendeurs uniquement)

```bash
cd backend
python generate_license.py --org "Nom du client" --tier enterprise --months 12
```

La clé privée doit être dans `backend/sapscope_license.pem` (non versionnée, à conserver en lieu sûr).

Tiers disponibles :

| Tier       | Utilisateurs | Clients SAP |
|------------|-------------|-------------|
| solo       | 1           | 3           |
| team       | 5           | 20          |
| enterprise | illimité    | illimité    |

---

## Agent SAP

L'agent se déploie sur le serveur d'application SAP. Il se connecte en RFC local et envoie un snapshot toutes les 24h.

### Installation

```bash
curl -O https://app.sapscope.com/dist/agent.tar.gz
tar xzf agent.tar.gz && cd sap-agent
pip install -r requirements.txt
```

Créez un fichier `.env` dans le dossier agent :

```env
SAPSCOPE_TOKEN=<token-genere-depuis-le-panel-admin>
SAPSCOPE_URL=https://app.sapscope.com
SAP_HOST=localhost
SAP_SYSNR=00
SAP_CLIENT=100
SAP_USER=SAPSCOPE_RFC
SAP_PASSWORD=<mot-de-passe>
```

Testez la connexion :

```bash
python agent.py --once
```

Automatisez avec un timer systemd ou un cron :

```bash
# cron — tous les jours à 2h
0 2 * * * cd /opt/sap-agent && python agent.py --once >> /var/log/sapscope-agent.log 2>&1
```

### Utilisateur RFC requis côté SAP

Voir [docs/sap-rfc-user-setup.md](docs/sap-rfc-user-setup.md) pour la création de l'utilisateur de communication et les autorisations minimales requises.

---

## Administration

Depuis l'interface web (onglet Admin, visible uniquement pour les comptes `is_admin`) :

- **Clients** : créer un périmètre SAP, générer des tokens agent, révoquer des tokens
- **Utilisateurs** : créer des comptes consultants, assigner les clients visibles par chaque consultant

---

## Variables d'environnement

| Variable              | Requis | Description                                                  |
|-----------------------|--------|--------------------------------------------------------------|
| `DATABASE_URL`        | oui    | URL PostgreSQL asyncpg                                       |
| `SAPSCOPE_JWT_SECRET` | oui    | Secret JWT (min. 32 caractères)                              |
| `ANTHROPIC_API_KEY`   | oui    | Clé API Anthropic pour les analyses                          |
| `LICENSE_KEY`         | self-hosted | JWT de licence signé par Sapscope                       |
| `REGISTRATION_ENABLED`| non    | `true` (SaaS) / `false` (self-hosted). Défaut : `true`       |
| `ALLOWED_ORIGINS`     | non    | Origines CORS autorisées. Défaut : `https://app.sapscope.com` |
| `ENV`                 | non    | `development` active les logs SQL et `/docs`. Défaut : `production` |

---

## Healthcheck

```bash
curl https://votre-domaine.com/healthz
```

---

## Licence

Logiciel propriétaire — © 2026 SAPscope. Tous droits réservés.
Toute redistribution ou modification sans autorisation écrite est interdite.
