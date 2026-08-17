#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/app}"
BRANCH="${DEPLOY_BRANCH:-main}"
LOG_PREFIX="[deploy]"

echo "$LOG_PREFIX Iniciando deploy en $(date -Iseconds)"

cd "$PROJECT_DIR"

echo "$LOG_PREFIX git pull origin $BRANCH ..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "$LOG_PREFIX docker compose build app ..."
docker compose build app

echo "$LOG_PREFIX docker compose up -d app ..."
docker compose up -d --no-deps app

echo "$LOG_PREFIX Deploy completado en $(date -Iseconds)"
