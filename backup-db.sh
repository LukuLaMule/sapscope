#!/usr/bin/env bash
# Backup PostgreSQL (SAPscope) — à lancer via cron ou manuellement
#
# Usage : ./backup-db.sh
# Crée  : backups/sapscope_YYYYMMDD_HHMMSS.sql.gz
# Garde : les 14 derniers fichiers (2 semaines si lancé quotidiennement)
#
# Cron suggéré (tous les jours à 3h) :
#   0 3 * * * /home/opc/Docker/sites/sapscope/backup-db.sh >> /var/log/sapscope-backup.log 2>&1

set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$COMPOSE_DIR/backups"
KEEP=14   # nombre de fichiers à conserver

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="$BACKUP_DIR/sapscope_${TIMESTAMP}.sql.gz"

echo "[$(date -Iseconds)] Démarrage backup → $OUTFILE"

# pg_dump via docker compose (pas besoin d'exposer le port 5432)
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db \
    pg_dump -U sapscope sapscope | gzip > "$OUTFILE"

SIZE="$(du -sh "$OUTFILE" | cut -f1)"
echo "[$(date -Iseconds)] Terminé — $SIZE"

# Rotation : supprimer les fichiers les plus anciens au-delà de $KEEP
EXISTING="$(ls -1t "$BACKUP_DIR"/sapscope_*.sql.gz 2>/dev/null | wc -l)"
if [ "$EXISTING" -gt "$KEEP" ]; then
    ls -1t "$BACKUP_DIR"/sapscope_*.sql.gz | tail -n +"$((KEEP + 1))" | xargs rm -f
    echo "[$(date -Iseconds)] Rotation : conservé $KEEP fichiers, supprimé $((EXISTING - KEEP))"
fi
