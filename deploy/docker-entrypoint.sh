#!/bin/sh
set -e

echo "[entrypoint] PingPoint starting..."

echo "[entrypoint] Waiting for database..."
max_attempts=30
attempt=0

until pg_isready -h "${PGHOST:-db}" -p "${PGPORT:-5432}" -U "${PGUSER:-pingpoint}" -q 2>/dev/null || [ $attempt -ge $max_attempts ]; do
  attempt=$((attempt + 1))
  echo "[entrypoint] Database not ready, attempt $attempt/$max_attempts..."
  sleep 1
done

if [ $attempt -ge $max_attempts ]; then
  echo "[entrypoint] Database not available after $max_attempts attempts"
  exit 1
fi

echo "[entrypoint] Database is ready"

echo "[entrypoint] Running database migrations..."
node --experimental-specifier-resolution=node -e "
const { ensureDatabase } = require('./dist/migrate.cjs');
ensureDatabase()
  .then(() => console.log('[entrypoint] Migrations complete'))
  .catch(err => { console.error('[entrypoint] Migration failed:', err); process.exit(1); });
" || {
  echo "[entrypoint] Migration via module failed, trying drizzle-kit..."
  npx drizzle-kit push --force || echo "[entrypoint] drizzle-kit push failed, continuing..."
}

echo "[entrypoint] Starting application..."
exec node dist/index.cjs
