# ADR-018: AUTH_SECRET Fail-Fast on Missing Configuration

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

The `docker-entrypoint.sh` script contained logic to auto-generate a random `AUTH_SECRET` when the environment variable was not set:

```bash
if [ -z "$AUTH_SECRET" ]; then
  export AUTH_SECRET=$(openssl rand -base64 32)
fi
```

This caused two compounding problems:

1. **Session invalidation on every restart**: `AUTH_SECRET` is used by NextAuth to sign and verify JWT session tokens. A new random secret on each container start means all existing sessions become invalid. Users are logged out after every deployment, restart, or container recreation. In orchestrated environments (Kubernetes, Docker Swarm), rolling updates cause continuous session churn.

2. **Incentive to use weak secrets**: Operators who discovered the logout-on-restart behaviour would set a static `AUTH_SECRET` to fix it -- but often chose weak values (`"secret"`, `"changeme"`, `"1234"`) because the system had trained them to believe the secret was optional. A weak `AUTH_SECRET` allows JWT forgery and session hijacking.

The auto-generation was originally intended as a convenience for first-time users, but it created a security footgun that actively harmed production deployments.

## Decision

Remove auto-generation entirely. The container startup script fails immediately with a clear, actionable error message if `AUTH_SECRET` is not configured:

```bash
if [ -z "$AUTH_SECRET" ]; then
  echo "ERROR: AUTH_SECRET is not set."
  echo ""
  echo "AUTH_SECRET is required for secure session management."
  echo "Generate one with: openssl rand -base64 32"
  echo ""
  echo "Set it in your environment:"
  echo "  docker run -e AUTH_SECRET=<your-secret> ..."
  echo "  # or in docker-compose.yml / .env file"
  exit 1
fi
```

### Design Principles

1. **Fail-fast over fail-silently**: A startup failure with a clear message is better than silently broken sessions that manifest as mysterious logouts days later.
2. **No magic defaults for security-critical configuration**: Secrets must be explicit, deliberate, and operator-owned.
3. **Error message as documentation**: The error message includes the generation command and usage examples, so operators can resolve the issue without consulting external docs.

### Alternatives Considered

- **Auto-generate and persist to a file**: Rejected -- adds statefulness to an otherwise stateless container, complicates volume management, and the persisted secret would still be a random value the operator never reviewed.
- **Warn but continue**: Rejected -- warnings in container logs are routinely ignored. The security impact is too severe for a soft warning.
- **Generate on first start, persist in DB**: Rejected -- secrets should not be stored in the application database. Separation of config and data is a deployment best practice.

## Consequences

### Positive
- Eliminates silent session invalidation on container restarts
- Removes the incentive to set weak secrets -- operators must consciously generate and configure a strong value
- Clear error message reduces support burden and misconfiguration incidents
- Aligns with twelve-factor app methodology (explicit configuration, no hidden defaults)
- Fail-fast behaviour surfaces misconfigurations during deployment, not in production at runtime

### Negative
- **Breaking change** for existing Docker users who relied on auto-generation -- their containers will fail to start after upgrading until they set `AUTH_SECRET`
- Slightly higher barrier to first-time setup -- one extra step before the container runs
- Development environments (docker-compose for local dev) must also set the variable, adding friction

### Risks
- Operators may copy the example secret from documentation verbatim instead of generating their own -- mitigated by using `openssl rand` output in examples rather than a static string
- Docker Hub image pulls may spike in "broken" reports if the changelog is not prominent -- mitigated by documenting the change in release notes and UPGRADING.md
- Some CI/CD pipelines may break if they relied on the container starting without explicit env vars
