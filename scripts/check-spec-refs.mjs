#!/usr/bin/env node
/**
 * Resolve qualified cross-spec references in specs/*.allium.
 *
 * WHY THIS EXISTS
 * ---------------
 * `allium check` does NOT resolve qualified references. Verified empirically
 * (allium 3.2.3): injecting `crm/TotallyBogusEntity.nonexistent_field` into a
 * surface produces 0 errors and zero mentions of the symbol — output is
 * byte-identical to the clean run.
 *
 * That matters because W-H1 (2026-08-25) deliberately replaced hand-copied
 * `external entity` stubs with qualified `crm/...` references. Copies drift
 * loudly: two visible declarations disagree, and a human notices — which is how
 * W-E6, W-F1 and W-H1 itself were all found. A qualified reference drifts
 * SILENTLY: rename `crm/Person.headline` and the consuming spec still checks
 * green while specifying an Art. 15 export built from a field that no longer
 * exists. That exact failure — `person.job_title` / `person.city` outliving the
 * fields — is what W-H1 was cleaning up.
 *
 * So the flip traded a loud failure mode for a silent one, and this script is
 * the trade's other half. Without it the safety property is supplied by
 * reviewer diligence rather than by CI.
 *
 * WHAT IT CHECKS
 *   1. every `alias/Symbol` resolves to a declaration in the aliased spec;
 *   2. every `alias/Symbol.member` additionally resolves `member` to a field or
 *      derived value inside that declaration's block.
 *
 * Exit 0 = all resolve. Exit 1 = at least one dangling reference.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Defaults to ./specs; a path argument lets CI or a probe point elsewhere. */
const SPECS_DIR =
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "specs");

/** Declarations that a qualified reference may point at. */
const DECL_RE =
  /^(?:external\s+)?(?:entity|value|enum|rule|invariant|surface|actor|contract|event|type|record|deferred)\s+([A-Za-z_]\w*)/gm;

/** `use "./crm.allium" as crm` */
const USE_RE = /^use\s+"\.\/([^"]+)"\s+as\s+([A-Za-z_]\w*)/gm;

/**
 * Members inside a declaration block: `field: Type`, `derived: expr`, and enum
 * members (bare identifiers, or `a | b | c` unions).
 */
function membersOf(body) {
  const out = new Set();
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("--")) continue;
    const field = t.match(/^([A-Za-z_]\w*)\s*:/);
    if (field) out.add(field[1]);
    // Nested `invariant Name {` — entity-scoped invariants are referenceable,
    // e.g. crm/Person.AutoCreatedHasRetention (crm.allium entity Person).
    const inv = t.match(/^invariant\s+([A-Za-z_]\w*)/);
    if (inv) out.add(inv[1]);
    // enum members, possibly `manual | auto_created | imported`
    if (/^[a-z_][\w]*(\s*\|\s*[a-z_][\w]*)*\s*(--.*)?$/.test(t)) {
      for (const m of t.split("--")[0].split("|")) out.add(m.trim());
    }
  }
  return out;
}

/** Map declaration name -> its member set, for one spec's source. */
function declare(src) {
  const decls = new Map();
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(
      /^(?:external\s+)?(?:entity|value|enum|contract|record)\s+([A-Za-z_]\w*)\s*\{/,
    );
    if (!m) continue;
    let depth = 0;
    const body = [];
    for (let j = i; j < lines.length; j++) {
      depth += (lines[j].match(/\{/g) || []).length;
      depth -= (lines[j].match(/\}/g) || []).length;
      if (j > i) body.push(lines[j]);
      if (depth === 0) break;
    }
    decls.set(m[1], membersOf(body.join("\n")));
  }
  // Single-line forms: `external entity Note { title: String }`
  for (const line of lines) {
    const m = line.match(
      /^(?:external\s+)?(?:entity|value|enum|record)\s+([A-Za-z_]\w*)\s*\{(.*)\}\s*$/,
    );
    if (m && !decls.has(m[1])) decls.set(m[1], membersOf(m[2].replace(/,/g, "\n")));
  }
  return decls;
}

/**
 * All names a qualified reference may resolve to: top-level declarations,
 * `config`, and — importantly — the METHODS declared inside a `contract` block.
 * A contract method is callable across specs as `alias/method(...)`, e.g.
 * `geo/is_valid_country_code(country)` in holiday-reference-data.allium, which
 * resolves to `geo-codes.allium` `contract GeoCodeLookupContract`. Omitting
 * these produced three false positives on the first run of this script.
 */
function declaredNames(src) {
  const names = new Set();
  for (const m of src.matchAll(DECL_RE)) names.add(m[1]);
  if (/^config\s*\{/m.test(src)) names.add("config");
  for (const [, body] of src.matchAll(/^contract\s+\w+\s*\{([\s\S]*?)^\}/gm)) {
    for (const n of membersOf(body)) names.add(n);
  }
  return names;
}

function configMembers(src) {
  const m = src.match(/^config\s*\{([\s\S]*?)^\}/m);
  return m ? membersOf(m[1]) : new Set();
}

const sources = new Map();
for (const f of readdirSync(SPECS_DIR).filter((f) => f.endsWith(".allium"))) {
  sources.set(f, readFileSync(join(SPECS_DIR, f), "utf8"));
}

const problems = [];
let checked = 0;

for (const [file, src] of sources) {
  const aliases = new Map();
  for (const m of src.matchAll(USE_RE)) aliases.set(m[2], m[1]);
  if (aliases.size === 0) continue;

  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Strip prose before scanning: `--` comments, and the contents of string
    // literals. An `open question "... crm/Person.Foo ..."` is discussion, not a
    // reference, and must not be resolved.
    const line = lines[i].replace(/"[^"]*"/g, '""');
    if (line.trim().startsWith("--")) continue;
    for (const [alias, target] of aliases) {
      const re = new RegExp(`\\b${alias}/([A-Za-z_]\\w*)(?:\\.([A-Za-z_]\\w*))?`, "g");
      for (const ref of line.matchAll(re)) {
        checked++;
        const targetSrc = sources.get(target);
        if (!targetSrc) {
          problems.push(`${file}:${i + 1}  ${alias}/... -> missing spec '${target}'`);
          continue;
        }
        const [, symbol, member] = ref;
        const names = declaredNames(targetSrc);

        // Collection plural convention: `crm/Persons` -> entity Person.
        const singular = symbol.endsWith("s") ? symbol.slice(0, -1) : null;
        const resolved = names.has(symbol)
          ? symbol
          : singular && names.has(singular)
            ? singular
            : null;

        if (!resolved) {
          problems.push(`${file}:${i + 1}  ${alias}/${symbol} -> not declared in ${target}`);
          continue;
        }
        if (!member) continue;

        const members =
          resolved === "config" ? configMembers(targetSrc) : declare(targetSrc).get(resolved);
        // Rules/surfaces/etc. have no member table here; only check what we modelled.
        if (members && members.size > 0 && !members.has(member)) {
          problems.push(
            `${file}:${i + 1}  ${alias}/${resolved}.${member} -> '${member}' not a member of ${resolved} in ${target}`,
          );
        }
      }
    }
  }
}

if (problems.length) {
  console.error(`Dangling cross-spec references (${problems.length}):\n`);
  for (const p of problems) console.error("  " + p);
  console.error(
    `\nallium check does NOT catch these — see the header of ${"scripts/check-spec-refs.mjs"}.`,
  );
  process.exit(1);
}

console.log(`check-spec-refs: ${checked} qualified reference(s) resolved, 0 dangling.`);
