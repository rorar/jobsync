#!/bin/sh
set -e

# Require AUTH_SECRET — ephemeral secrets invalidate all sessions on restart
if [ -z "$AUTH_SECRET" ]; then
  echo "FATAL: AUTH_SECRET is not set." >&2
  echo "Sessions require a stable secret. Generate one with:" >&2
  echo "  openssl rand -base64 32" >&2
  echo "Then set it as an environment variable in your Docker Compose or deployment config." >&2
  exit 1
fi

# Run migrations as root (before switching users)
npx -y prisma@6.19.0 migrate deploy

# Fix /data permissions and run app as nextjs user
chown -R nextjs:nodejs /data
export HOME=/home/nextjs
exec su -s /bin/sh nextjs -c "node server.js"
