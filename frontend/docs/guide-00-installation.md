# Self-Hosted Installation Guide

## Prerequisites

- A Linux server (Debian/Ubuntu/RHEL) with at least 2 GB RAM
- Docker and Docker Compose installed
- A domain name pointing to your server (optional but recommended for HTTPS)
- Your SAPscope **license key** (received by email)

---

## 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

---

## 2. Download the deployment files

```bash
mkdir sapscope && cd sapscope
curl -O https://sapscope.com/deploy/docker-compose.yml
curl -O https://sapscope.com/deploy/nginx.conf
curl -O https://sapscope.com/deploy/.env.example
cp .env.example .env
```

---

## 3. Configure the environment

Edit `.env` and fill in the required values:

```bash
nano .env
```

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Strong password for the database |
| `SAPSCOPE_JWT_SECRET` | Random secret — run `openssl rand -hex 32` |
| `LICENSE_KEY` | Your license key (received by email) |
| `APP_URL` | Your domain, e.g. `https://sapscope.mycompany.com` |
| `ALLOWED_ORIGINS` | Same as `APP_URL` |
| `ADMIN_EMAIL` | Admin account email — created automatically on first start |
| `ADMIN_PASSWORD` | Admin account password — **change it after first login** |
| `SMTP_*` | Mail server settings (optional, for password reset) |

---

## 4. Start the application

```bash
docker compose up -d
```

Wait about 30 seconds for the database to initialize, then verify:

```bash
docker compose ps
# All three containers must be "Up" or "healthy"
```

---

## 5. Admin account

If you set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in your `.env`, the admin account is **created automatically** on first startup. No extra command needed.

**Change your password immediately after first login.**

---

## 6. Access the application

Open `http://your-server-ip` (or your domain if configured) in your browser.

Log in with the credentials you set in step 5.

---

## 7. Configure HTTPS (recommended)

If you have a domain, add a reverse proxy in front of SAPscope. Example with Caddy:

```bash
apt install caddy
```

`/etc/caddy/Caddyfile`:
```
sapscope.mycompany.com {
    reverse_proxy localhost:80
}
```

```bash
systemctl restart caddy
```

Caddy handles HTTPS/TLS automatically via Let's Encrypt.

---

## 8. Next steps

1. **Create clients** — Admin → Clients tab → Add client
2. **Install agents** — Admin → Clients → "Install Agent" → follow the instructions
3. **Add consultants** — Admin → Users tab → Add user, assign to clients

---

## Updating SAPscope

```bash
docker compose pull
docker compose up -d
```

## Support

Contact: support@sapscope.com
