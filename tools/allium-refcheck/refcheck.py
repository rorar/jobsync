#!/usr/bin/env python3
"""Reference-integrity linter for Allium specifications.

WHY THIS EXISTS
---------------
`allium check` proves SYNTAX, not reference integrity. CLAUDE.md
(§ Specification Pattern) records this, verified twice independently against
allium 3.2.3 and re-confirmed here against 3.6.1: an invariant that reads a
field which does not exist, or iterates an entity type that was never declared,
still leaves `check` at "0 errors" with the warning and info counters unmoved.
A green `allium check` means the file parses. It does not mean the file refers
to anything that exists.

This tool closes that one gap and nothing wider. It works over `allium parse`
JSON -- the same AST the compiler builds -- so it never guesses from text.

WHAT IT CHECKS (five checks)
  dangling-provides   a surface advertises an operation no rule listens for
  arity               provides/listener argument-count mismatch, optionals honoured
  related             a `related:` target that does not resolve to a surface
  timeout             a `timeout:` target that does not resolve to a rule
  invariant-collection  `for x in Foos` where no type Foo is declared

WHAT IT DOES NOT CHECK -- read this before treating a green run as assurance
---------------------------------------------------------------------------
It checks REFERENCES, NOT TRUTH. Every name resolving is a much weaker property
than the spec being right:

  * An invariant naming real entities and real fields can still assert
    something the implementation does not do. That is spec/code drift, and the
    tool for it is `allium:weed`, not this.
  * Field-level references are NOT checked. `person.no_such_field` inside a
    rule body passes here. Only entity COLLECTIONS in invariant `for` clauses
    are resolved, because that is the one place where the reference is
    unambiguously to a declared type.
  * `requires:` / `ensures:` bodies are not resolved at all. Only `when:`,
    `provides:`, `related:`, `timeout:` and invariant `for` collections.
  * Rules with a `when` binding (`when p: Person.status transitions_to x`) are
    state-transition triggers, not named ones. They can never satisfy a
    `provides:`, and are not counted as listeners.
  * Cross-module qualified references (`crm/PersonDetail`) are resolved when
    the alias is declared and the target file is present, and SKIPPED
    otherwise. A typo'd alias is not reported -- silence here is "not
    examined", not "verified".
  * Nothing outside `specs/`. Code is not read.
  * The INVERSE of dangling-provides -- a rule listening for a trigger no
    surface provides -- is NOT checked here. `allium check` already emits it as
    an info ("Rule 'X' listens for trigger 'Y' but no local surface provides or
    rule emits it"), and duplicating it would put this gate in the business of
    re-deciding another tool's severity.

ACKNOWLEDGED FINDINGS
---------------------
A finding is printed but does NOT fail the run when an `open question` in the
SAME spec file names both the surface (or invariant) and the target. Allium
already has a construct for "we know, and we have not resolved it yet", and
both surviving findings in this tree use it -- specs/e2e-test-infrastructure
.allium:1792 for the four Run* triggers, specs/notification-dispatch.allium:896
for UpdatePreferences / ResetToDefaults. Both spell out the two candidate
resolutions and why neither was taken.

This is the KNOWN_DEBT convention of scripts/check-e2e-residue.sh ("not
permission, debt with a number"), with one improvement: the acknowledgement
lives next to the thing it excuses, so deleting the open question re-arms the
gate automatically and there is no second list to rot. Both the surface AND the
target must be named, so an open question mentioning `RunAll` in passing cannot
silence a different surface's defect.

CALIBRATION (reproduce with `git show <rev>:specs/... > tmpdir`, then --specs)
-----------------------------------------------------------------------------
  3663e8cc^   23 active,  0 acknowledged
  3663e8cc    15 active,  2 acknowledged   -8: 3 NotificationInbox provides
                                           (surface deleted), 3 NotificationBell
                                           (3 listener rules added), 2 newly
                                           acknowledged by that commit's open
                                           question
  176cb8b9^   15 active,  2 acknowledged   unchanged; no spec touched between
  176cb8b9     0 active,  7 acknowledged   -15: 10 repaired, 5 acknowledged
  HEAD         0 active,  7 acknowledged

Each transition matches the content of the commit that produced it. Zero at
HEAD on its own would prove nothing -- a tool that always prints zero passes
that test -- which is why the historical numbers and `--self-test` exist.

FALSE POSITIVES ARE THE FAILURE MODE THAT MATTERS
-------------------------------------------------
A gate that cries wolf gets switched off, and this project has a documented
instance: the Allium language server was evaluated for exactly this job and
rejected because thirteen of its errors were confirmed false against both the
file text and `allium parse` -- "CacheHit must define a when: trigger" where
the `when:` is present, an import alias reported unrecognised where
`use "./crm.allium" as crm` is declared (see docs/BUGS.md).

So every check here is written to stay silent when it cannot be sure. Three
specific shapes it deliberately does not flag, each verified against the
current tree:

 1. SINGULAR ITERATION. specs/inside-track.allium writes `for r in NetworkPath`
    and `for r in Referral`, where both types exist under exactly those names.
    A comment there records that the plural form is an open modelling question,
    not a typo. Resolution is exact-match-first, so these are silent -- and
    they are not downgraded to a warning either. Reference integrity asks "does
    this name resolve"; `NetworkPath` resolves. Whether a collection should be
    named in the plural is a STYLE opinion, and a reference checker that also
    ships style opinions is how a gate earns the reputation that gets it
    switched off.

 2. `timeout:` OUTSIDE A SURFACE. `timeout` is a clause keyword, so the field
    `timeout: Duration` on `external entity PlaywrightRunner`
    (specs/e2e-test-infrastructure.allium:28) parses as a Clause, identical in
    shape to a surface's `timeout: InterviewReminder`. Resolving that against
    the rule table would report `Duration` as an undeclared rule. The check is
    scoped to Surface blocks for that reason and no other.

 3. `for x in Foo.bar`. An invariant may iterate a FIELD
    (`SchedulerState.active_runs`), which parses as MemberAccess rather than
    Ident. Field-level resolution is out of scope, so these are skipped rather
    than guessed at.

CALIBRATION
-----------
Run `--self-test` for the recorded historical numbers, or reproduce them:
  git show <rev>:specs/foo.allium  into a temp dir, then point this at it.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
from typing import Any, Iterable, Iterator, Optional

EXIT_OK = 0
EXIT_FINDINGS = 1
EXIT_CANNOT_RUN = 2  # allium missing, parse failure -- distinct from "no findings"

CHECKS = ("dangling-provides", "arity", "related", "timeout", "invariant-collection")

# Block kinds an invariant may legitimately quantify over -- i.e. kinds that
# have an ADDRESSABLE SET of members.
#
# The exclusions are the substance of this check, so each carries its reason:
#
#   Value    EXCLUDED, and this is the evidenced one. Values have no identity
#            and therefore no addressable set of all instances, so `for chain in
#            FallbackChains` over `value FallbackChain` is unresolvable rather
#            than merely unchecked. Both spec repairs at 176cb8b9 turn on
#            exactly this ("Values have no identity and so no addressable
#            collection" -- that commit message), and both were invisible to a
#            universe that admitted Value. Admitting it costs two real defects
#            and buys nothing: measured across HEAD and both historical
#            revisions, no legitimate iteration resolves only via a Value.
#   Config   EXCLUDED. A config block is a singleton, not a set.
#   Contract EXCLUDED. A contract is an obligation, not data.
#   Rule /
#   Surface  EXCLUDED. `for x in SomeRule` is not a thing; admitting them would
#            make the check resolve names it exists to reject.
#
#   Enum     ADMITTED. Unlike a value, an enum's variants ARE a closed,
#            addressable set. No spec in this tree iterates one, so this is a
#            judgement rather than a measurement -- and it is deliberately the
#            permissive judgement, because the cost of being wrong here is a
#            false positive, which is the failure mode that gets gates switched
#            off. If an enum iteration ever needs rejecting, it will be visible
#            and arguable; a wrongly-flagged one would just be noise.
#   Actor    ADMITTED. Actors have identity (User).
#   Variant  ADMITTED (a top-level `variant Foo = Bar {...}` projects an entity
#            and inherits its identity). This is what makes inside-track's
#            `for r in NetworkPath` resolve rather than be reported.
QUANTIFIABLE_KINDS = frozenset({"Entity", "ExternalEntity", "Actor", "Enum"})


# --------------------------------------------------------------------------
# AST access helpers. Every one of these is shaped by the real `allium parse`
# output for allium 3.6.1; none of them guess.
# --------------------------------------------------------------------------

def _name_of(node: Any) -> Optional[str]:
    if isinstance(node, dict):
        n = node.get("name")
        if isinstance(n, dict) and isinstance(n.get("name"), str):
            return n["name"]
        if isinstance(n, str):
            return n
    return None


def _clause_values(block: dict, keyword: str) -> Iterator[dict]:
    """Yield the value node of every `keyword:` clause in a block."""
    for item in block.get("items", []):
        kind = item.get("kind")
        if isinstance(kind, dict) and "Clause" in kind:
            clause = kind["Clause"]
            if clause.get("keyword") == keyword:
                value = clause.get("value")
                if isinstance(value, dict):
                    yield value


def _clause_entries(value: dict) -> Iterator[dict]:
    """A clause value is either one node or a Block of them. Yield each node,
    unwrapping `WhenGuard` (`Action(a, b) when cond`) to its action -- 25 of the
    71 `provides` entries in this tree are guarded, and skipping them, as the
    prototype did, silently drops a third of the check's reach."""
    items = value["Block"].get("items", []) if "Block" in value else [value]
    for item in items:
        if not isinstance(item, dict):
            continue
        if "WhenGuard" in item:
            action = item["WhenGuard"].get("action")
            if isinstance(action, dict):
                yield action
        else:
            yield item


def _target(node: dict) -> Optional[tuple[Optional[str], str, list, dict]]:
    """Resolve a reference node to (qualifier, name, args, span).

    Handles the three shapes that occur as reference targets: a bare `Ident`, a
    `Call` on an Ident, and a `Call` on a `QualifiedName` (`crm/PersonDetail`).
    Returns None for anything else -- silence, not a guess.
    """
    fn = node["Call"]["function"] if "Call" in node else node
    args = node["Call"].get("args", []) if "Call" in node else []
    if "Ident" in fn:
        return None, fn["Ident"]["name"], args, fn["Ident"]["span"]
    if "QualifiedName" in fn:
        q = fn["QualifiedName"]
        return q.get("qualifier"), q.get("name"), args, q["span"]
    return None


def _arity(args: list) -> tuple[int, int]:
    """(required, total). A trailing `?` on a parameter parses as TypeOptional."""
    total = len(args)
    optional = 0
    for arg in args:
        inner = arg.get("Positional") if isinstance(arg, dict) else None
        if isinstance(inner, dict) and "TypeOptional" in inner:
            optional += 1
    return total - optional, total


def _walk(node: Any) -> Iterator[dict]:
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


def _names_word(haystack: str, needle: str) -> bool:
    """Whole-word containment. Identifiers in open-question prose are followed
    by `(`, `.`, `,` or whitespace, never by more identifier characters, so a
    substring match would let `Run` acknowledge `RunAll`."""
    import re
    return re.search(r"(?<![A-Za-z0-9_])" + re.escape(needle) + r"(?![A-Za-z0-9_])",
                     haystack) is not None


def _singular_candidates(collection: str) -> list[str]:
    """Type names a plural collection could be built from.

    Exact match is tried FIRST by the caller, so this only widens. It is
    deliberately generous: a candidate that resolves means silence, and silence
    is the safe direction for a gate.
    """
    out = [collection]
    if collection.endswith("ies"):
        out.append(collection[:-3] + "y")
    for suffix in ("sses", "ches", "shes", "xes", "zes", "ses"):
        if collection.endswith(suffix):
            out.append(collection[: -len(suffix)] + suffix[:-2])
    if collection.endswith("es"):
        out.append(collection[:-2])
    if collection.endswith("s"):
        out.append(collection[:-1])
    return out


# --------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------

class Module:
    def __init__(self, path: str, ast: dict, data: bytes):
        self.path = path
        # BYTES, deliberately. `allium parse` is Rust and its spans are BYTE
        # offsets; counting newlines over a decoded str overshoots by one line
        # per ~50 non-ASCII characters. Measured on
        # specs/e2e-test-infrastructure.allium: 266 bytes of em-dashes put every
        # reported line 5 low. A gate that prints the wrong file:line is worse
        # than no gate -- the reader checks the quoted line, finds a comment,
        # and stops believing the tool.
        self.data = data
        self.types: set[str] = set()
        # Declared, but NOT quantifiable -- name -> kind. Kept so the finding
        # can say "FallbackChain is a value" instead of the misleading "no type
        # is declared", which reads like the tool cannot see the declaration.
        self.unquantifiable: dict[str, str] = {}
        self.rules: dict[str, dict] = {}
        self.surfaces: dict[str, dict] = {}
        self.imports: dict[str, str] = {}   # alias -> absolute path
        self.listeners: dict[str, list[tuple[str, int, int]]] = {}
        self.open_questions: list[str] = []
        self._build(ast)

    def acknowledges(self, *names: str) -> bool:
        """True when an `open question` in THIS file names every one of these
        identifiers as a whole word.

        Allium already has a construct for "we know, and we decided not to
        resolve it yet", and both surviving findings in this tree use it: the
        four Run* triggers are named in an open question at
        specs/e2e-test-infrastructure.allium:1792 that sets out the two
        resolutions and why neither was taken, and UpdatePreferences /
        ResetToDefaults likewise at specs/notification-dispatch.allium:896.

        Reading it beats a hand-maintained allowlist in the wrapper for one
        reason: the acknowledgement lives next to the thing it excuses, so
        deleting the open question re-arms the gate automatically and no second
        list can rot. It follows the KNOWN_DEBT convention of
        scripts/check-e2e-residue.sh -- "not permission, debt with a number" --
        and acknowledged findings are still printed on every run.

        The conjunction is what keeps this tight: BOTH the surface and the
        target must be named, so an open question that happens to mention
        `RunAll` in passing cannot silence a different surface's defect.
        """
        for text in self.open_questions:
            if all(_names_word(text, n) for n in names):
                return True
        return False

    def line(self, span: Optional[dict]) -> int:
        if not span or "start" not in span:
            return 0
        return self.data.count(b"\n", 0, span["start"]) + 1

    def quote(self, span: Optional[dict]) -> str:
        """The shortest decisive quote: the source line the span sits on."""
        n = self.line(span)
        if n == 0:
            return ""
        lines = self.data.splitlines()
        if n > len(lines):
            return ""
        return lines[n - 1].decode("utf-8", "replace").strip()

    def _build(self, ast: dict) -> None:
        base = os.path.dirname(os.path.abspath(self.path))
        for decl in ast.get("module", {}).get("declarations", []):
            if "OpenQuestion" in decl:
                parts = decl["OpenQuestion"].get("text", {}).get("parts", [])
                self.open_questions.append(
                    "".join(p.get("Text", "") for p in parts if isinstance(p, dict)))

            elif "Use" in decl:
                use = decl["Use"]
                alias = (use.get("alias") or {}).get("name")
                parts = use.get("path", {}).get("parts", [])
                target = "".join(p.get("Text", "") for p in parts if isinstance(p, dict))
                if alias and target:
                    self.imports[alias] = os.path.normpath(os.path.join(base, target))

            elif "Variant" in decl:
                # A top-level `variant Foo = Bar { ... }` introduces the name Foo
                # as a type. inside-track.allium's NetworkPath is one of these,
                # and omitting the kind is what would make `for r in NetworkPath`
                # a false positive.
                name = _name_of(decl["Variant"])
                if name:
                    self.types.add(name)

            elif "Block" in decl:
                block = decl["Block"]
                kind, name = block.get("kind"), _name_of(block)
                if not name:
                    continue
                if kind in QUANTIFIABLE_KINDS:
                    self.types.add(name)
                elif kind in ("Value", "Config", "Contract"):
                    self.unquantifiable[name] = kind
                elif kind == "Rule":
                    trigger = None
                    for value in _clause_values(block, "when"):
                        # A `when` binding is a state transition, not a named
                        # trigger; only a Call can be listened for by name.
                        if "Call" in value:
                            t = _target(value)
                            if t and t[0] is None:
                                req, tot = _arity(t[2])
                                trigger = (t[1], req, tot)
                    self.rules[name] = {"trigger": trigger, "span": block.get("span")}
                    if trigger:
                        self.listeners.setdefault(trigger[0], []).append(
                            (name, trigger[1], trigger[2])
                        )
                elif kind == "Surface":
                    entry: dict[str, list] = {"provides": [], "related": [], "timeout": []}
                    for keyword in ("provides", "related", "timeout"):
                        for value in _clause_values(block, keyword):
                            for node in _clause_entries(value):
                                t = _target(node)
                                if t:
                                    entry[keyword].append(t)
                    self.surfaces[name] = entry


# --------------------------------------------------------------------------
# Checks
# --------------------------------------------------------------------------

class Finding:
    def __init__(self, check: str, path: str, line: int, message: str, quote: str,
                 acknowledged: bool = False):
        self.check, self.path, self.line = check, path, line
        self.message, self.quote = message, quote
        # Named by an `open question` in the same file: real, known, and
        # deliberately deferred. Printed on every run, but does not fail it.
        self.acknowledged = acknowledged

    def render(self) -> str:
        head = f"{self.path}:{self.line}: {self.message}"
        return f"{head}\n      {self.quote}" if self.quote else head


def _resolve(modules: dict[str, Module], mod: Module, qualifier: Optional[str]) -> Optional[Module]:
    """The module a reference points into: this one, or an imported one.

    Returns None when the qualifier is unknown or its file is absent -- the
    caller then SKIPS the reference. Reporting it would mean claiming a
    cross-module target is broken on the strength of not having looked.
    """
    if qualifier is None:
        return mod
    target = mod.imports.get(qualifier)
    return modules.get(os.path.normpath(target)) if target else None


def check_dangling_provides(modules, mod) -> list[Finding]:
    out = []
    for sname, surface in sorted(mod.surfaces.items()):
        for qualifier, tname, args, span in surface["provides"]:
            other = _resolve(modules, mod, qualifier)
            if other is None or tname in other.listeners:
                continue
            where = f"{qualifier}/" if qualifier else ""
            out.append(Finding(
                "dangling-provides", mod.path, mod.line(span),
                f"surface {sname} provides {where}{tname}/{len(args)} "
                f"— no rule listens for it (`when {tname}(...)`)",
                mod.quote(span), mod.acknowledges(sname, tname)))
    return out


def check_arity(modules, mod) -> list[Finding]:
    out = []
    for sname, surface in sorted(mod.surfaces.items()):
        for qualifier, tname, args, span in surface["provides"]:
            other = _resolve(modules, mod, qualifier)
            if other is None:
                continue
            offered = len(args)
            for rname, req, tot in other.listeners.get(tname, []):
                if req <= offered <= tot:
                    continue
                shape = f"{req}" if req == tot else f"{req}..{tot}"
                out.append(Finding(
                    "arity", mod.path, mod.line(span),
                    f"surface {sname} provides {tname} with {offered} argument(s), "
                    f"but rule {rname} accepts {shape}",
                    mod.quote(span), mod.acknowledges(sname, tname)))
    return out


def check_related(modules, mod) -> list[Finding]:
    out = []
    for sname, surface in sorted(mod.surfaces.items()):
        for qualifier, tname, _args, span in surface["related"]:
            other = _resolve(modules, mod, qualifier)
            if other is None or tname in other.surfaces:
                continue
            where = f"{qualifier}/" if qualifier else ""
            out.append(Finding(
                "related", mod.path, mod.line(span),
                f"surface {sname} is related to {where}{tname}, "
                f"which is not a declared surface",
                mod.quote(span), mod.acknowledges(sname, tname)))
    return out


def check_timeout(modules, mod) -> list[Finding]:
    # Surface-scoped by construction: mod.surfaces only holds Surface blocks, so
    # `timeout: Duration` on external entity PlaywrightRunner never reaches here.
    out = []
    for sname, surface in sorted(mod.surfaces.items()):
        for qualifier, tname, _args, span in surface["timeout"]:
            other = _resolve(modules, mod, qualifier)
            if other is None or tname in other.rules:
                continue
            where = f"{qualifier}/" if qualifier else ""
            out.append(Finding(
                "timeout", mod.path, mod.line(span),
                f"surface {sname} times out into {where}{tname}, "
                f"which is not a declared rule",
                mod.quote(span), mod.acknowledges(sname, tname)))
    return out


def check_invariant_collection(modules, mod, ast_cache) -> list[Finding]:
    out = []
    for decl in ast_cache[mod.path].get("module", {}).get("declarations", []):
        if "Invariant" not in decl:
            continue
        inv = decl["Invariant"]
        iname = _name_of(inv) or "<anonymous>"
        for node in _walk(inv.get("body")):
            if "For" not in node:
                continue
            coll = node["For"].get("collection")
            if not isinstance(coll, dict):
                continue
            # MemberAccess (`for r in SchedulerState.active_runs`) iterates a
            # FIELD. Field resolution is out of scope; skip rather than guess.
            if "Ident" in coll:
                qualifier, cname, span = None, coll["Ident"]["name"], coll["Ident"]["span"]
            elif "QualifiedName" in coll:
                q = coll["QualifiedName"]
                qualifier, cname, span = q.get("qualifier"), q.get("name"), q["span"]
            else:
                continue
            other = _resolve(modules, mod, qualifier)
            if other is None:
                continue
            candidates = list(dict.fromkeys(_singular_candidates(cname)))
            if any(c in other.types for c in candidates):
                continue
            where = f"{qualifier}/" if qualifier else ""
            blocked = [(c, other.unquantifiable[c]) for c in candidates
                       if c in other.unquantifiable]
            if blocked:
                name, kind = blocked[0]
                why = (f"{name} is a `{kind.lower()}`, which has no identity and "
                       f"therefore no addressable collection to quantify over")
            else:
                why = f"no type it could be a collection of is declared " \
                      f"(tried: {', '.join(candidates)})"
            out.append(Finding(
                "invariant-collection", mod.path, mod.line(span),
                f"invariant {iname} iterates {where}{cname}, but {why}",
                mod.quote(span), mod.acknowledges(iname, cname)))
    return out


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------

def run(spec_dir: str, enabled: set[str]) -> tuple[list[Finding], list[str]]:
    paths = sorted(glob.glob(os.path.join(spec_dir, "*.allium")))
    if not paths:
        return [], [f"no *.allium files under {spec_dir}"]

    # The invariant check needs the raw AST; keep it beside the model rather
    # than re-parsing, which would double the (subprocess-bound) runtime.
    ast_cache: dict[str, dict] = {}
    modules: dict[str, Module] = {}
    errors: list[str] = []
    for path in paths:
        proc = subprocess.run(["allium", "parse", path], capture_output=True, text=True)
        if not proc.stdout.strip():
            errors.append(f"{path}: `allium parse` produced no output (rc={proc.returncode})"
                          f" {proc.stderr.strip()[:200]}")
            continue
        try:
            ast = json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            errors.append(f"{path}: `allium parse` output is not JSON: {exc}")
            continue

        # A spec that does not parse STILL yields valid JSON on stdout -- with
        # `declarations: []` and the failure in `diagnostics`. Left unchecked,
        # such a file contributes no references, no findings, and a clean run:
        # the gate would report success precisely when it examined nothing.
        # Measured 2026-09-06 on a deliberately broken fixture; all 38 real
        # specs return rc=0 with an empty diagnostics array, so gating on either
        # signal costs nothing. Both are checked because either alone is enough
        # and neither is documented as stable.
        fatal = [d for d in (ast.get("diagnostics") or [])
                 if d.get("severity") == "Error"]
        if proc.returncode != 0 or fatal:
            first = fatal[0]["message"][:160] if fatal else proc.stderr.strip()[:160]
            errors.append(f"{path}: does not parse (rc={proc.returncode}, "
                          f"{len(fatal)} error diagnostic(s)) — {first}")
            continue
        with open(path, "rb") as fh:
            data = fh.read()
        mod = Module(path, ast, data)
        modules[os.path.normpath(os.path.abspath(path))] = mod
        ast_cache[path] = ast

    findings: list[Finding] = []
    for mod in sorted(modules.values(), key=lambda m: m.path):
        if "dangling-provides" in enabled:
            findings += check_dangling_provides(modules, mod)
        if "arity" in enabled:
            findings += check_arity(modules, mod)
        if "related" in enabled:
            findings += check_related(modules, mod)
        if "timeout" in enabled:
            findings += check_timeout(modules, mod)
        if "invariant-collection" in enabled:
            findings += check_invariant_collection(modules, mod, ast_cache)
    return findings, errors



# --------------------------------------------------------------------------
# Self-test
#
# Three of the five checks (arity, related, timeout) find NOTHING in this
# repository, at HEAD and at every historical revision measured. A check that
# has never fired is indistinguishable from a check that CANNOT fire, and "it
# printed zero" is the one result a broken gate and a working one agree on. So
# the positive fixture below makes each of the five fire exactly once, and the
# negative fixture pins the shapes that must stay silent.
#
# Run it with --self-test. It needs `allium` on PATH and writes only to a
# temporary directory.
# --------------------------------------------------------------------------

FIXTURE_POSITIVE = {"probe.allium": '-- fixture\nentity Thing {\n  id: String\n}\n\nvalue Shade {\n  tone: String\n}\n\nrule DoThing {\n  when: Act(user, thing)\n  requires: thing.id != null\n  ensures: thing.id != null\n}\n\nsurface Panel {\n  facing user: Person\n  context thing: Thing\n\n  provides:\n    Act(user, thing, extra)\n    Ghost(user)\n\n  related:\n    NoSuchSurface(thing)\n\n  timeout:\n    NoSuchRule\n}\n\nactor Person {\n  identified_by: id\n}\n\ninvariant BadIter {\n  for s in Shades:\n    s.tone != null\n}\n\ninvariant MissingIter {\n  for z in Zebras:\n    z.id != null\n}\n'}

FIXTURE_NEGATIVE = {"base.allium": '-- allium: 3\nentity Widget {\n  id: String\n}\n\nrule HandleRemote {\n  when: RemoteAct(user, widget)\n  requires: widget.id != null\n  ensures: widget.id != null\n}\n\nsurface RemotePanel {\n  facing user: Operator\n  context widget: Widget\n  exposes:\n    widget.id\n}\n\nactor Operator {\n  identified_by: id\n}\n', "main.allium": '-- allium: 3\nuse "./base.allium" as base\n\nentity Referral {\n  id: String\n  tipster: String\n}\n\nvariant NetworkPath : Referral {\n  insider: String\n}\n\nentity Runner {\n  id: String\n}\n\nexternal entity Harness {\n  timeout: Duration\n  workers: Integer\n}\n\nrule OptionalArity {\n  when: Flexible(user, runner, note?)\n  requires: runner.id != null\n  ensures: runner.id != null\n}\n\nrule GuardedOp {\n  when: Guarded(user, runner)\n  requires: runner.id != null\n  ensures: runner.id != null\n}\n\nrule TimedOut {\n  when: DeadlinePassed(runner)\n  requires: runner.id != null\n  ensures: runner.id != null\n}\n\nsurface Console {\n  facing user: Pilot\n  context runner: Runner\n\n  provides:\n    Flexible(user, runner)\n    Guarded(user, runner)\n        when runner.id != null\n\n  related:\n    base/RemotePanel(runner)\n\n  timeout:\n    TimedOut\n}\n\nsurface Deferred {\n  facing user: Pilot\n  context runner: Runner\n\n  provides:\n    NotYetWired(user, runner)\n}\n\nactor Pilot {\n  identified_by: id\n}\n\ninvariant SingularIteration {\n  for r in NetworkPath where r.insider != null:\n    r.tipster != null\n}\n\ninvariant SingularEntity {\n  for r in Referral where r.id != null:\n    r.tipster != null\n}\n\nopen question "Surface Deferred provides NotYetWired and no rule listens for it; the signature is undecided."\n'}


def self_test() -> int:
    """Assert each check fires on a known defect and stays silent on the
    known-good shapes. Returns 0 on success."""
    import tempfile

    # (check, count) pairs the positive fixture must produce.
    want_positive = {
        "dangling-provides": 1,     # Ghost(user), no listener
        "arity": 1,                 # Act/3 vs rule DoThing accepting 2
        "related": 1,               # NoSuchSurface
        "timeout": 1,               # NoSuchRule
        "invariant-collection": 2,  # Shades (a `value`) and Zebras (undeclared)
    }
    # What the negative fixture pins, each a shape that HAS produced or COULD
    # produce a false positive:
    #   singular iteration over a variant   `for r in NetworkPath`
    #   singular iteration over an entity   `for r in Referral`
    #   `timeout: Duration` on an external entity, not a surface
    #   optional arity   provides Flexible/2 vs `when Flexible(user, runner, note?)`
    #   a WhenGuard-guarded `provides` that DOES have a listener
    #   a qualified cross-module `related: base/RemotePanel(...)`
    #   `timeout:` naming a rule whose own trigger has a different name
    #   a dangling provides named by an `open question` -> acknowledged, not active
    want_negative_active = 0
    want_negative_ack = 1

    ok = True
    for label, fixture, expect in (
        ("positive", FIXTURE_POSITIVE, want_positive),
        ("negative", FIXTURE_NEGATIVE, None),
    ):
        with tempfile.TemporaryDirectory(prefix="refcheck-selftest-") as tmp:
            for name, body in fixture.items():
                with open(os.path.join(tmp, name), "w", encoding="utf-8") as fh:
                    fh.write(body)
            findings, errors = run(tmp, set(CHECKS))
            if errors:
                for e in errors:
                    print(f"self-test[{label}]: FAIL — {e}")
                ok = False
                continue
            active = [f for f in findings if not f.acknowledged]
            ack = [f for f in findings if f.acknowledged]
            if expect is not None:
                got = {c: sum(1 for f in active if f.check == c) for c in CHECKS}
                for check in CHECKS:
                    n, want = got[check], expect.get(check, 0)
                    verdict = "ok" if n == want else "FAIL"
                    if n != want:
                        ok = False
                    print(f"self-test[{label}] {check:22} fired {n}x, want {want}x  {verdict}")
                if ack:
                    print(f"self-test[{label}]: FAIL — {len(ack)} unexpected acknowledgement(s)")
                    ok = False
            else:
                for f in active:
                    print(f"self-test[{label}]: FAIL — false positive: {f.render()}")
                if len(active) != want_negative_active:
                    ok = False
                if len(ack) != want_negative_ack:
                    print(f"self-test[{label}]: FAIL — {len(ack)} acknowledged, "
                          f"want {want_negative_ack}")
                    ok = False
                if ok:
                    print(f"self-test[{label}] every must-not-flag shape stayed "
                          f"silent ({len(ack)} correctly acknowledged)  ok")

    print("self-test: PASS" if ok else "self-test: FAIL")
    return EXIT_OK if ok else EXIT_FINDINGS


TRAILER = """
  This checks REFERENCES, not truth. Each finding above names something the
  spec points at that is not declared anywhere the spec can see it.

  To resolve one, either make the reference resolve (add the rule that listens,
  fix the name, correct the arity) or -- if it is a real gap you are choosing
  not to close yet -- record it as an `open question` in the SAME spec file
  naming both the surface/invariant and the target. That is what the two
  acknowledged findings in this tree do, and it keeps the reason next to the
  thing it excuses instead of in an allowlist that rots."""


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(
        prog="refcheck",
        description="Reference-integrity linter for Allium specs. "
                    "Checks references, NOT truth -- see module docstring.")
    ap.add_argument("--specs", default="specs",
                    help="directory holding *.allium (default: specs)")
    ap.add_argument("--only", action="append", choices=CHECKS, default=None,
                    help="run only this check (repeatable)")
    ap.add_argument("--json", action="store_true", help="emit findings as JSON")
    ap.add_argument("--summary", action="store_true",
                    help="print a per-check count even when clean")
    ap.add_argument("--self-test", action="store_true",
                    help="prove each check fires on a known defect and stays "
                         "silent on the known-good shapes")
    args = ap.parse_args(argv)

    if shutil.which("allium") is None:
        print("refcheck: `allium` is not on PATH — cannot parse, so nothing was "
              "checked. This is NOT a clean run.", file=sys.stderr)
        return EXIT_CANNOT_RUN

    if args.self_test:
        return self_test()

    enabled = set(args.only) if args.only else set(CHECKS)
    findings, errors = run(args.specs, enabled)

    if errors:
        for e in errors:
            print(f"refcheck: {e}", file=sys.stderr)
        print("refcheck: at least one spec could not be parsed — the result "
              "below is incomplete.", file=sys.stderr)

    order = lambda f: (f.path, f.line, f.check)
    active = sorted([f for f in findings if not f.acknowledged], key=order)
    known = sorted([f for f in findings if f.acknowledged], key=order)

    if args.json:
        print(json.dumps([{"check": f.check, "file": f.path, "line": f.line,
                           "message": f.message, "quote": f.quote,
                           "acknowledged": f.acknowledged}
                          for f in sorted(findings, key=order)], indent=2))
        if errors:
            return EXIT_CANNOT_RUN
        return EXIT_FINDINGS if active else EXIT_OK

    if known:
        print("refcheck: acknowledged — named by an `open question` in the same "
              "file, so known and deferred, not permission:")
        for f in known:
            print("  " + f.render().replace("\n      ", "\n        "))

    if active:
        print("refcheck: FAIL — these references do not resolve, and nothing "
              "records why:", file=sys.stderr)
        for f in active:
            print("  " + f.render().replace("\n      ", "\n        "), file=sys.stderr)
        print(TRAILER, file=sys.stderr)

    n_specs = len(glob.glob(os.path.join(args.specs, "*.allium")))
    if args.summary or not active:
        counts = {c: sum(1 for f in active if f.check == c) for c in sorted(enabled)}
        detail = "  ".join(f"{c}={n}" for c, n in counts.items())
        print(f"refcheck: {len(active)} unresolved reference(s) "
              f"({len(known)} acknowledged) over {n_specs} spec(s)  [{detail}]")

    if errors:
        return EXIT_CANNOT_RUN
    return EXIT_FINDINGS if active else EXIT_OK


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
