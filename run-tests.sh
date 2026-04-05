#!/usr/bin/env bash
# Lance les tests backend depuis l'hôte.
# Usage : ./run-tests.sh [pytest args]
set -euo pipefail

DB_PW=$(docker compose exec -T backend env | grep DATABASE_URL | sed 's/.*sapscope:\(.*\)@db.*/\1/')
TEST_URL="postgresql+asyncpg://sapscope:${DB_PW}@db:5432/sapscope_test"

exec docker compose exec -T \
  -e TEST_DATABASE_URL="${TEST_URL}" \
  backend python -m pytest tests/ "$@"
