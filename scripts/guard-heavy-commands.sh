#!/usr/bin/env bash
# PreToolUse guard: refuse BARE invocations of the tools that have taken this
# host down, and name the wrapper that exists for each.
#
# Why a hook and not just the rule in CLAUDE.md: the rule IS in CLAUDE.md, has
# been there for months, and was still violated repeatedly — by the main
# session and by subagents that had been given the rule verbatim in their
# brief. Prose is advice; this is enforcement, and because it judges the
# command rather than the caller it needs no way to tell an agent from a human.
#
# It inspects the COMMAND POSITION of each shell segment, never the arguments.
# `grep -n "npx tsc" scripts/foo.sh` must keep working: mentioning a tool is not
# running it, and a guard that cannot tell the difference gets switched off
# within a day.
#
# WHAT IT REACHES. It stops the slip, not the decision. Command substitution,
# `eval`, and hand-rolled paths like `node node_modules/jest/bin/jest.js` all
# pass, deliberately — closing them would be an arms race against shell syntax,
# and it fails open on a parse error or a harness timeout regardless, so it
# could not honestly be called enforcement. If you find yourself reaching for
# one of those to get past this, stop and ask the operator instead: the wrapper
# exists because the bare command has taken this host down.
#
# Contract: PreToolUse JSON on stdin. Exit 0 allows, exit 2 blocks and shows
# stderr to the model. Any parsing failure allows — a guard must never be the
# reason a session cannot work.
set -uo pipefail

# The program is passed with -c ON PURPOSE. `python3 <<'PY'` would make the
# heredoc python's STDIN, so json.load(sys.stdin) would read this source instead
# of the hook payload and the guard would allow everything — which is exactly
# what the first version of this file did.
GUARD_PROGRAM=$(cat <<'PY'
import json, re, shlex, sys

# prefixes that wrap a real command: skip them to find the command position
PREFIX = {"nice", "ionice", "env", "time", "sudo", "command", "nohup", "stdbuf",
          "timeout", "xargs", "setsid"}
# Shells that take a command STRING: recurse into it. `sh -c "npx jest"` is
# routine quoting, not evasion.
SHELLS = {"sh", "bash", "zsh", "dash"}

def verdict(argv):
    """Return a wrapper suggestion if argv[0] is a bare heavy tool, else None."""
    cmd, rest = argv[0], argv[1:]
    base = cmd.rsplit("/", 1)[-1]

    if base in SHELLS:
        # recurse into the -c argument
        for k, a in enumerate(rest):
            if a == "-c" and k + 1 < len(rest):
                try:
                    inner = shlex.split(rest[k + 1])
                except ValueError:
                    return None
                return verdict(inner) if inner else None
        return None

    if base == "exec":
        return verdict(rest) if rest else None

    # `bun x` and `npm exec` / `npm x` are the documented aliases of bunx/npx.
    # Normalise them here so the runner branch below sees a plain tool name.
    if base in {"bun", "npm"} and rest[:1] in (["x"], ["exec"]):
        return verdict(["npx", *rest[1:]])

    if base in {"npx", "bunx", "pnpx"}:
        # skip npx's own flags (--yes, -y, --package=x ...)
        tool = next((a for a in rest if not a.startswith("-")), None)
        return {
            "tsc": "bash scripts/typecheck-safe.sh",
            "jest": "bash scripts/test.sh",
            "playwright": "./scripts/test-e2e.sh",
        }.get(tool)

    if base == "tsc":
        return "bash scripts/typecheck-safe.sh"
    if base == "jest":
        return "bash scripts/test.sh"
    if base == "playwright":
        return "./scripts/test-e2e.sh"

    if base in {"pnpm", "yarn"}:
        sub = next((a for a in rest if not a.startswith("-")), None)
        if sub in {"exec", "dlx"}:
            tool = next((a for a in rest[rest.index(sub) + 1:] if not a.startswith("-")), None)
        else:
            tool = sub
        return {
            "tsc": "bash scripts/typecheck-safe.sh",
            "jest": "bash scripts/test.sh",
            "playwright": "./scripts/test-e2e.sh",
            "test": "bash scripts/test.sh",
            "build": "bash scripts/build-safe.sh",
        }.get(tool)

    if base in {"bun", "npm"}:
        # `npm test` / `bun run test` map to bare jest via package.json, and are
        # what a well-meaning agent types. Scan the args rather than fixed
        # positions, so `bun run --silent build` is caught too.
        args = [a for a in rest if not a.startswith("-")]
        if args[:1] == ["run"]:
            args = args[1:]
        first = args[0] if args else None
        if first == "test":
            return "bash scripts/test.sh"
        if first == "build":
            return "bash scripts/build-safe.sh"
        if first == "dev":
            return "./scripts/dev.sh   (for E2E, let ./scripts/test-e2e.sh start it)"

    if base == "bun":
        if rest[:1] == ["test"]:
            return "bash scripts/test.sh"
        if rest[:2] == ["run", "build"]:
            return "bash scripts/build-safe.sh"
        if rest[:2] == ["run", "dev"]:
            return "./scripts/dev.sh   (for E2E, let ./scripts/test-e2e.sh start it)"
    if base == "next":
        if rest[:1] == ["build"]:
            return "bash scripts/build-safe.sh"
        if rest[:1] == ["dev"]:
            return "./scripts/dev.sh   (for E2E, let ./scripts/test-e2e.sh start it)"
    return None

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if payload.get("tool_name") != "Bash":
    sys.exit(0)
command = (payload.get("tool_input") or {}).get("command") or ""

def strip_heredoc_bodies(cmd):
    """Remove heredoc CONTENT before analysis.

    A heredoc body is data, not commands: `python3 -c "$(cat <<'PY' ... PY)"`
    that writes a script mentioning `npx jest` must not be blocked. This guard
    blocked exactly that on its first day of life, which is the failure mode the
    header warns about — a guard with false positives gets disabled, and then
    you have neither the rule nor the protection.
    """
    lines, out, i = cmd.split("\n"), [], 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        for m in re.finditer(r"(<<-?)\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\2", line):
            dash, term = m.group(1) == "<<-", m.group(3)
            j = i + 1
            # bash only accepts an indented terminator for <<-; matching a
            # stripped line for plain << ends the body early and lets the rest
            # of a heredoc be read as commands.
            while j < len(lines) and (
                lines[j].strip() != term if dash else lines[j] != term
            ):
                j += 1
            i = j
        i += 1
    return "\n".join(out)

command = strip_heredoc_bodies(command)

# Very large commands are never a bare tool invocation, and shlex is superlinear
# (1 MB measured at ~18 s), which would push the hook past its harness timeout —
# where it is killed and therefore fails OPEN. Cap the work instead.
if len(command) > 200_000:
    sys.exit(0)

def split_segments(cmd):
    """Split on shell separators that are OUTSIDE quotes.

    A newline inside a quoted argument is DATA. Splitting on it blocked
    `git commit -m "...multi-line message mentioning npx jest..."` — which is
    exactly how the commit that fixes this hook gets written.
    """
    out, buf, quote, i = [], [], None, 0
    while i < len(cmd):
        c = cmd[i]
        if quote:
            buf.append(c)
            if c == quote:
                quote = None
        elif c in "'\"":
            quote = c
            buf.append(c)
        elif c in ";|\n&" or cmd.startswith("&&", i) or cmd.startswith("||", i):
            if cmd.startswith(("&&", "||"), i):
                i += 1
            out.append("".join(buf)); buf = []
        else:
            buf.append(c)
        i += 1
    out.append("".join(buf))
    return out

for segment in split_segments(command):
    segment = segment.strip()
    if not segment:
        continue
    try:
        argv = shlex.split(segment)
    except ValueError:
        continue
    i = 0
    while i < len(argv) and (
        re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", argv[i])        # VAR=value
        or argv[i].rsplit("/", 1)[-1] in PREFIX               # nice, ionice, env ...
        or (i > 0 and (argv[i].startswith("-") or argv[i].isdigit()))  # their flags/values
    ):
        i += 1
    if i >= len(argv):
        continue
    wrapper = verdict(argv[i:])
    if wrapper:
        sys.stderr.write(
            f"BLOCKED by scripts/guard-heavy-commands.sh: `{argv[i]}` invoked bare.\n"
            f"Use instead:  {wrapper}\n\n"
            "The wrapper is not a convenience alias. Each adds a memory cgroup, nice/ionice\n"
            "and a timeout, because the bare command has taken this host down before — see\n"
            "CLAUDE.md, section 'Using these scripts (resource discipline)'.\n"
            "If you truly need the bare tool, stop and ask the operator rather than working\n"
            "around this guard.\n"
        )
        sys.exit(2)
sys.exit(0)
PY
)
exec python3 -c "$GUARD_PROGRAM"
