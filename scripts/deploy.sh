#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${DEPLOY_BRANCH:-main}"
LOG_PREFIX="[deploy]"

echo "$LOG_PREFIX Iniciando deploy en $(date -Iseconds)"

cd "$PROJECT_DIR"

echo "$LOG_PREFIX git pull origin $BRANCH ..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "$LOG_PREFIX npm install ..."
npm install --omit=dev --silent

echo "$LOG_PREFIX Reiniciando servidor ..."
NODE_BIN="$(command -v node)"
exec "$NODE_BIN" src/server.js
