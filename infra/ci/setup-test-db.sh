#!/bin/bash
# CI only: installs PostgreSQL 16 + PostGIS from the official PostgreSQL apt repository (no Docker
# Hub pulls, so no rate limits), starts it and creates the test database the server tests use.
# Writes the connection string to /tmp/test-database-url.
set -euo pipefail

. /etc/os-release
export DEBIAN_FRONTEND=noninteractive

install -d /usr/share/postgresql-common/pgdg
curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update -qq
apt-get install -y -qq postgresql-16 postgresql-16-postgis-3 >/dev/null

# No systemd in the build container: start the cluster directly.
pg_ctlcluster 16 main start || true
PORT=$(pg_lsclusters --no-header | awk '$1 == "16" && $2 == "main" { print $3 }')
for _ in $(seq 1 30); do
  pg_isready -h 127.0.0.1 -p "$PORT" -q && break
  sleep 1
done
pg_isready -h 127.0.0.1 -p "$PORT"

su postgres -c "psql -p $PORT -q -c \"CREATE ROLE rip LOGIN SUPERUSER PASSWORD 'rip'\""
su postgres -c "createdb -p $PORT -O rip rip_test"
echo "postgres://rip:rip@127.0.0.1:${PORT}/rip_test" > /tmp/test-database-url
echo "Test database ready on port $PORT"
