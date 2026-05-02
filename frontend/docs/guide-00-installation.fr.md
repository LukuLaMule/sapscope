# Guide d'installation self-hosted

## Prérequis

- Un serveur Linux (Debian/Ubuntu/RHEL) avec au moins 2 Go de RAM
- Docker et Docker Compose installés
- Un nom de domaine pointant sur votre serveur (optionnel mais recommandé pour HTTPS)
- Votre **clé de licence** SAPscope (reçue par email)

---

## 1. Installer Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

---

## 2. Télécharger les fichiers de déploiement

```bash
mkdir sapscope && cd sapscope
curl -O https://sapscope.com/deploy/docker-compose.yml
curl -O https://sapscope.com/deploy/nginx.conf
curl -O https://sapscope.com/deploy/.env.example
cp .env.example .env
```

---

## 3. Configurer l'environnement

Éditez `.env` et renseignez les valeurs requises :

```bash
nano .env
```

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Mot de passe fort pour la base de données |
| `SAPSCOPE_JWT_SECRET` | Secret aléatoire — générer avec `openssl rand -hex 32` |
| `LICENSE_KEY` | Votre clé de licence (reçue par email) |
| `APP_URL` | Votre domaine, ex. `https://sapscope.macompany.com` |
| `ALLOWED_ORIGINS` | Identique à `APP_URL` |
| `ADMIN_EMAIL` | Email du compte admin — créé automatiquement au premier démarrage |
| `ADMIN_PASSWORD` | Mot de passe du compte admin — **à changer après la première connexion** |
| `SMTP_*` | Paramètres serveur mail (optionnel, pour le reset de mot de passe) |

---

## 4. Démarrer l'application

```bash
docker compose up -d
```

Attendez environ 30 secondes le temps que la base de données s'initialise, puis vérifiez :

```bash
docker compose ps
# Les trois containers doivent être "Up" ou "healthy"
```

---

## 5. Compte administrateur

Si vous avez renseigné `ADMIN_EMAIL` et `ADMIN_PASSWORD` dans votre `.env`, le compte admin est **créé automatiquement** au premier démarrage. Aucune commande supplémentaire n'est nécessaire.

**Changez votre mot de passe immédiatement après la première connexion.**

---

## 6. Accéder à l'application

Ouvrez `http://ip-de-votre-serveur` (ou votre domaine si configuré) dans votre navigateur.

Connectez-vous avec les identifiants définis à l'étape 5.

---

## 7. Configurer HTTPS (recommandé)

Si vous avez un domaine, ajoutez un reverse proxy devant SAPscope. Exemple avec Caddy :

```bash
apt install caddy
```

`/etc/caddy/Caddyfile` :
```
sapscope.macompany.com {
    reverse_proxy localhost:80
}
```

```bash
systemctl restart caddy
```

Caddy gère le HTTPS/TLS automatiquement via Let's Encrypt.

---

## 8. Étapes suivantes

1. **Créer des clients** — Admin → onglet Clients → Ajouter un client
2. **Installer les agents** — Admin → Clients → "Install Agent" → suivre les instructions
3. **Ajouter des consultants** — Admin → onglet Users → Ajouter un utilisateur, l'assigner aux clients

---

## Mettre à jour SAPscope

```bash
docker compose pull
docker compose up -d
```

## Support

Contact : support@sapscope.com
