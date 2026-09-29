# Security policy

`rorar/jobsync` is a public fork of [Gsync/jobsync](https://github.com/Gsync/jobsync), a self-hosted
job application tracker. One maintainer looks after it. The upstream project does not take pull
requests from this fork, so a fix made here is not automatically in upstream, and the other way round.

## Supported versions

Security fixes go to the `main` branch only. Older commits and images do not receive backported
fixes.

The container image `ghcr.io/rorar/jobsync` is meant to be built from pushes to `main` and from
`v*.*.*` tags (`.github/workflows/docker-publish.yml`). That build currently fails
(`docs/BUGS.md` `INF-B1`), so a published image can be older than `main` and lack recent fixes.
Check the image's build date against the fix before relying on it, or build from `main` yourself.

## Reporting a vulnerability

**Do not report an unfixed vulnerability in public** — not in an issue, a pull request, a discussion
or a commit, and not in `docs/BUGS.md`.

1. **GitHub private vulnerability reporting (preferred).** Open the repository's **Security** tab and
   choose **Report a vulnerability**, or go to
   <https://github.com/rorar/jobsync/security/advisories/new>.

   > **Maintainer action required.** Private vulnerability reporting is **disabled** on this
   > repository (checked 2026-09-29), so this route does not work yet. Enable it under
   > **Settings → Advanced Security → Private vulnerability reporting → Enable** (the section was
   > called "Code security" in older versions of the settings page). Delete this note once it is on.

2. **Email (fallback).** _No address is published yet._
   <!-- MAINTAINER: add a monitored security contact address here, then delete the line above. -->

While neither route works, there is no private channel. Keep the report to yourself until one
exists; do not disclose it anywhere public in the meantime.

A useful report contains:

- the affected component (file, route, server action or connector module) and the commit or image
  tag you tested;
- the impact: what an attacker can read, change or cause, and what access they need first;
- the steps to reproduce — in the private report only.

## What happens next

There is no guaranteed response time; this is a single-maintainer project. Please allow time for a
fix before you disclose anything. Once a fix is on `main`, the advisory is published, with credit to
you if you want it. If the upstream project is affected too, it is informed through its own channel.

After disclosure, the flaw is recorded in [`docs/BUGS.md`](docs/BUGS.md) under an ID (for example
`SEC-B<n>`). New rows there describe the class of the flaw, where it was, and the fixing commit —
not a reproduction.

## Scope

In scope: everything in this repository — the Next.js application, its server actions and API
routes (`/api/*` and the public `/api/v1/*`), the connector modules, the Prisma schema, the
`Dockerfile` and the GitHub workflows, and the scripts under `scripts/`.

Out of scope:

- the configuration of your own deployment, for example a weak or reused `AUTH_SECRET`, or an
  instance exposed without TLS;
- flaws in third-party services that JobSync calls (for example EURES, the Bundesagentur für Arbeit
  API, or AI providers) — report those to the provider;
- flaws in upstream `Gsync/jobsync` that this fork does not contain — report those upstream.

## Security design references

- [`specs/security-rules.allium`](specs/security-rules.allium) — the security rules as a specification
- ADR-015 to ADR-019 in [`docs/adr/`](docs/adr/) — ownership checks (IDOR), credential defence,
  encryption salt, `AUTH_SECRET`, rate limiting and server-action security
- [`docs/security/STRIDE-auth-threat-model.md`](docs/security/STRIDE-auth-threat-model.md) — threat
  model for authentication

## For contributors and AI agents

If you find a security-relevant defect while working on something else, do not put reproduction
detail in an issue, a pull request, a commit message or a tracker row. Report it through the private
route above. The issue and pull request templates ask about security for this reason: a public issue
may name only the class of a flaw and its `docs/BUGS.md` ID.
