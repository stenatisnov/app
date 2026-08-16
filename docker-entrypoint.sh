#!/usr/bin/env bash
set -euo pipefail

# Postgres is a standard TCP database, so `prisma migrate deploy` can reach
# it directly. Runs as the unprivileged `remixapp` user throughout.
echo "[entrypoint] applying migrations..."
npm run db:deploy

echo "[entrypoint] syncing bootstrap admin + default settings..."
npm run db:seed

echo "[entrypoint] starting scheduler..."
npm run scheduler &

echo "[entrypoint] starting app..."
exec npm run start
