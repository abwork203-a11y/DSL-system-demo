#!/bin/sh
set -e

echo "Running database migration..."
node src/db/migrate.js

echo "Running seed (idempotent — skips if data already exists)..."
node src/db/seed.js

echo "Starting server..."
exec node src/server.js
