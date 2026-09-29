<!--
Fill every section. Delete a checklist line only if it does not apply, and say
why in a few words. A pull request written by an AI agent is held to the same
template. Base branch is `main`; CI runs on pull requests to `main` and `dev`
only, and CI does not run the Playwright suite.
-->

## Linked issue and tracker IDs

Closes #

Tracker rows this pull request closes or changes (link each row at a pushed commit; do not copy its evidence):

- `docs/BUGS.md`:
- Open-items register (`V#`, `D#`, `M#`):

## What changed and why

<!-- Two to five sentences. Name what this pull request deliberately does NOT change. -->

## Incidental fixes

<!-- Each defect fixed on the way, as its own item: `path:line`, what was wrong, evidence. Write "none" if none. -->

## Gates

Run each gate through its wrapper, one after another, never two at once. Paste the `[<name>] EXIT=<rc>` line the wrapper printed. Judge by that line, never by `$?` after a pipe.

- Exit **75**: busy, nothing ran (the CPU guard, or another server holding this worktree's port lock). Not a result; rerun later.
- No `EXIT=` line: the run failed before it started; the reason is the last thing printed.
- Exit **124**: timeout; it proves nothing either way.

Commit the gates ran against: `<sha>`

| Gate | Command | Result (paste the line, or "n/a: reason") |
|---|---|---|
| Type check | `bash scripts/typecheck-safe.sh` | `[typecheck-safe] EXIT=` |
| Unit and component tests | `bash scripts/test.sh` | `[test.sh] EXIT=` |
| Production build | `bash scripts/build-safe.sh` | `[build-safe] EXIT=` |
| E2E (full suite, or name the specs) | `./scripts/test-e2e.sh` | `[test-e2e] EXIT=` |
| Spec references | `bash scripts/check-spec-refs.sh` and `node scripts/check-spec-refs.mjs` | exit code of each |
| Notification writers (if notification code changed) | `bash scripts/check-notification-writers.sh` | exit code |

## Checklist

- [ ] Bug fix: a regression test fails on the unfixed code and passes with the fix — name it:
- [ ] `docs/BUGS.md`: each fixed row marked with its commit; the header totals reconcile with the block table
- [ ] Open-items register: each closed `V#` / `D#` / `M#` row updated
- [ ] i18n: every new or changed UI string exists in en, de, fr and es; `e2e/` searched for selectors on changed strings
- [ ] Specs: every `specs/*.allium` edit made through `allium:tend` (a green `allium check` proves syntax only)
- [ ] Architecture change: ADR added in `docs/adr/`
- [ ] UI change: ui-design agents and `/responsive-design` consulted before implementation; screenshots below
- [ ] Heavy tools run only through the wrappers; sub-agents ran no tests, builds, type checks, E2E or dev servers
- [ ] Commits follow conventional commits; agent commits end with a `Co-Authored-By:` trailer
- [ ] No secrets, credentials or real personal data in the diff, the tests or the screenshots

## Screenshots (UI changes)

<!-- Before and after; desktop and a phone-width view. Use seeded test data, never real personal data. -->

## Security note

<!--
State one of:
- "No security impact."
- The class of the issue and its docs/BUGS.md ID (for example "IDOR, SEC-B<n>").
Never exploit steps. An unfixed, exploitable vulnerability is reported through SECURITY.md, not in a pull request.
-->
