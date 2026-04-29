# SAPscope — Installation Self-Hosted

## Prérequis

- Docker 24+ et Docker Compose v2
- Linux (Ubuntu 22.04+ recommandé) — 2 vCPU / 2 GB RAM minimum
- Port 80 (ou autre) ouvert en entrée
- Clé de licence SAPscope (obtenir sur sapscope.fr)

---

## Installation en 5 minutes

### 1. Télécharger les fichiers de déploiement

```bash
mkdir sapscope && cd sapscope
curl -O https://sapscope.fr/deploy/docker-compose.yml
curl -O https://sapscope.fr/deploy/nginx.conf
curl -O https://sapscope.fr/deploy/.env.example
```

### 2. Configurer

```bash
cp .env.example .env
```

Éditer `.env` et renseigner :
- `POSTGRES_PASSWORD` — mot de passe base de données (générer : `openssl rand -hex 32`)
- `SAPSCOPE_JWT_SECRET` — clé secrète JWT (générer : `openssl rand -hex 32`)
- `LICENSE_KEY` — votre clé de licence SAPscope
- `APP_URL` — URL publique de votre instance (ex: `https://sapscope.votre-domaine.com`)

### 3. Démarrer

```bash
docker compose up -d
```

L'application est disponible sur `http://votre-serveur` (ou le port configuré dans `HTTP_PORT`).

### 4. Créer le premier compte admin

```bash
docker compose exec backend python bootstrap_admin.py \
  --email admin@votre-domaine.com \
  --password MotDePasseSecurise
```

### 5. Installer l'agent SAP

Connectez-vous à l'application → suivez le guide d'onboarding.
L'agent se télécharge et s'installe en une commande sur le serveur SAP.

---

## HTTPS avec reverse proxy (recommandé en production)

Si vous utilisez nginx ou Caddy devant SAPscope, configurez `HTTP_PORT=8080` et laissez votre reverse proxy gérer le TLS.

Exemple Caddy :
```
sapscope.votre-domaine.com {
    reverse_proxy localhost:8080
}
```

---

## Mise à jour

```bash
docker compose pull
docker compose up -d
```

---

## Support

- Documentation : https://sapscope.fr/docs
- Email : support@sapscope.fr
