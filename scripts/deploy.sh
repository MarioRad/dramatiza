#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$PROJECT_DIR"

git pull origin "$BRANCH"
npm install --omit=dev --silent
pm2 restart dramatiza
