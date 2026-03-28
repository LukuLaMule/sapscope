#!/usr/bin/env bash
# First-time SSL setup for sapscope.luku.fr
# Run once on the server before docker compose up
#
# Usage: sudo bash init-ssl.sh your@email.com

set -euo pipefail

DOMAIN="sapscope.luku.fr"
EMAIL="${1:-}"

[[ -n "$EMAIL" ]] || { echo "Usage: sudo bash init-ssl.sh your@email.com"; exit 1; }
[[ $EUID -eq 0 ]] || { echo "Run as root"; exit 1; }

# Create dirs
mkdir -p certbot/conf certbot/www

# nginx needs to start to serve the ACME challenge,
# but it can't start without a certificate.
# Solution: use a temporary self-signed cert for the first boot.

echo "Creating temporary self-signed certificate..."
mkdir -p "certbot/conf/live/$DOMAIN"
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout "certbot/conf/live/$DOMAIN/privkey.pem" \
  -out    "certbot/conf/live/$DOMAIN/fullchain.pem" \
  -subj   "/CN=$DOMAIN" 2>/dev/null

echo "Starting nginx with self-signed cert..."
docker compose up -d frontend

echo "Requesting Let's Encrypt certificate..."
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --email "$EMAIL" \
  --agree-tos --no-eff-email \
  -d "$DOMAIN"

echo "Reloading nginx with real certificate..."
docker compose exec frontend nginx -s reload

echo
echo "SSL configured for $DOMAIN"
echo "Certificates will renew automatically every 12h."
