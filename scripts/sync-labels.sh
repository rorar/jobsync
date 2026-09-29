#!/usr/bin/env bash
# Sync the repository's GitHub labels with .github/labels.yml.
#
# DRY RUN BY DEFAULT. Without --apply nothing is written: the script prints the
# `gh label create` command it would run for each label and, when gh can read
# the repository, whether that label would be created, updated or left as is.
#
# Usage:
#   bash scripts/sync-labels.sh                        # dry run, rorar/jobsync
#   bash scripts/sync-labels.sh --apply                # create or update labels
#   bash scripts/sync-labels.sh --repo OWNER/NAME      # another repository
#   bash scripts/sync-labels.sh --file PATH            # another definitions file
#
# Idempotent: a missing label is created; an existing one whose colour or
# description differs is updated with `gh label create --force`; an identical
# one is skipped. Labels that are not in the file -- GitHub's nine defaults
# included -- are never changed and never deleted.
#
# Requires bash 4 or later (associative arrays) and python3 with PyYAML to read the file. gh is required for --apply;
# for a dry run it is optional (without it, or without a login, the dry run
# still validates the file and prints the commands, but cannot say which
# labels already exist).
#
# Exit codes:
#   0  dry run finished, or every label is in sync after --apply
#   1  --apply: at least one gh call failed (the others were still attempted)
#   2  bad arguments, unreadable or invalid definitions file, missing tool

set -Eeuo pipefail
trap 'printf "sync-labels: unexpected failure at line %s\n" "$LINENO" >&2' ERR

readonly DEFAULT_REPO="rorar/jobsync"
readonly SEP=$'\x1f' # ASCII unit separator: not whitespace, so empty fields survive `read`

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"

repo="${DEFAULT_REPO}"
file="${repo_root}/.github/labels.yml"
apply=0

usage() {
  cat <<'EOF'
Usage: bash scripts/sync-labels.sh [--apply] [--repo OWNER/NAME] [--file PATH]

  (no flag)      dry run: validate the file, print what would be done
  --apply        create missing labels and update changed ones
  --repo R       target repository (default: rorar/jobsync)
  --file F       label definitions (default: .github/labels.yml)
  -h, --help     this text
EOF
}

die() {
  printf 'sync-labels: %s\n' "$*" >&2
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) apply=1 ;;
    --dry-run) apply=0 ;;
    --repo)
      [ "$#" -ge 2 ] || die "--repo needs a value"
      repo="$2"
      shift
      ;;
    --repo=*) repo="${1#--repo=}" ;;
    --file)
      [ "$#" -ge 2 ] || die "--file needs a value"
      file="$2"
      shift
      ;;
    --file=*) file="${1#--file=}" ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
  shift
done

[[ "${repo}" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || die "--repo must look like OWNER/NAME, got: ${repo}"
[ -r "${file}" ] || die "cannot read ${file}"
command -v python3 >/dev/null 2>&1 || die "python3 is required to read ${file}"

# Parse and validate the definitions. Output: one label per line,
# name<US>color<US>description. The validator rejects control characters in
# every field, so neither the line nor the field separator can occur inside one.
records="$(
  python3 - "${file}" <<'PY'
import re
import sys

try:
    import yaml
except ImportError:
    sys.stderr.write("sync-labels: PyYAML is not installed (python3 -m pip install pyyaml)\n")
    sys.exit(2)

path = sys.argv[1]
try:
    with open(path, encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
except (OSError, yaml.YAMLError) as exc:
    sys.stderr.write(f"sync-labels: {path}: {exc}\n")
    sys.exit(2)

if not isinstance(data, dict) or not isinstance(data.get("labels"), list) or not data["labels"]:
    sys.stderr.write(f"sync-labels: {path}: expected a non-empty top-level 'labels' list\n")
    sys.exit(2)

control = re.compile(r"[\x00-\x1f\x7f]")
errors = []
seen = set()
rows = []
for index, item in enumerate(data["labels"], 1):
    where = f"entry {index}"
    if not isinstance(item, dict):
        errors.append(f"{where}: not a mapping")
        continue
    unknown = sorted(set(item) - {"name", "color", "description"})
    if unknown:
        errors.append(f"{where}: unknown keys {unknown}")
    name = item.get("name")
    color = item.get("color")
    description = item.get("description", "")
    if not isinstance(name, str) or not name.strip():
        errors.append(f"{where}: 'name' missing or not a string")
        continue
    where = f"entry {index} ({name!r})"
    if name != name.strip() or name.startswith("-"):
        errors.append(f"{where}: name has surrounding whitespace or starts with '-'")
    if len(name) > 50:
        errors.append(f"{where}: name longer than 50 characters")
    if name.lower() in seen:
        errors.append(f"{where}: duplicate name (GitHub label names are case-insensitive)")
    seen.add(name.lower())
    if not isinstance(color, str) or not re.fullmatch(r"[0-9A-Fa-f]{6}", color):
        errors.append(f"{where}: color must be a quoted string of six hex digits without '#'")
        color = "000000"
    if description is None:
        description = ""
    if not isinstance(description, str):
        errors.append(f"{where}: description must be a string")
        description = ""
    if len(description) > 100:
        errors.append(f"{where}: description longer than 100 characters ({len(description)})")
    for field in (name, color, description):
        if control.search(field):
            errors.append(f"{where}: control character in a field")
            break
    rows.append((name, color.lower(), description))

if errors:
    for line in errors:
        sys.stderr.write(f"sync-labels: {path}: {line}\n")
    sys.exit(2)

for name, color, description in rows:
    sys.stdout.write(f"{name}\x1f{color}\x1f{description}\n")
PY
)" || exit 2

# Read the labels the repository has now, keyed by lower-cased name.
declare -A cur_color=()
declare -A cur_desc=()
have_existing=0
if command -v gh >/dev/null 2>&1; then
  if existing="$(gh label list --repo "${repo}" --limit 1000 --json name,color,description \
    --jq '.[] | [.name, (.color | ascii_downcase), (.description // "")] | join("\u001f")' 2>/dev/null </dev/null)"; then
    have_existing=1
    while IFS="${SEP}" read -r ename ecolor edesc; do
      [ -n "${ename}" ] || continue
      cur_color["${ename,,}"]="${ecolor}"
      cur_desc["${ename,,}"]="${edesc}"
    done <<<"${existing}"
  fi
elif [ "${apply}" = 1 ]; then
  die "gh is required for --apply"
fi

if [ "${apply}" = 1 ] && [ "${have_existing}" != 1 ]; then
  die "cannot list the labels of ${repo} (is gh logged in, and does the repository exist?)"
fi

if [ "${apply}" = 1 ]; then mode="APPLY"; else mode="DRY RUN"; fi
printf 'sync-labels: %s  repo=%s  file=%s\n' "${mode}" "${repo}" "${file#"${repo_root}/"}"
if [ "${have_existing}" != 1 ]; then
  printf 'sync-labels: could not read existing labels (gh missing or not logged in); state shown as "?"\n'
fi

total=0
n_create=0
n_update=0
n_same=0
n_failed=0
while IFS="${SEP}" read -r name color desc; do
  [ -n "${name}" ] || continue
  total=$((total + 1))
  key="${name,,}"

  if [ "${have_existing}" != 1 ]; then
    state="?"
  elif [ -z "${cur_color[${key}]+set}" ]; then
    state="create"
  elif [ "${cur_color[${key}]}" = "${color}" ] && [ "${cur_desc[${key}]}" = "${desc}" ]; then
    state="unchanged"
  else
    state="update"
  fi

  case "${state}" in
    create) n_create=$((n_create + 1)) ;;
    update) n_update=$((n_update + 1)) ;;
    unchanged) n_same=$((n_same + 1)) ;;
  esac

  cmd=(gh label create "${name}" --repo "${repo}" --color "${color}" --description "${desc}" --force)

  if [ "${apply}" != 1 ]; then
    printf '%-9s ' "${state}"
    printf '%q ' "${cmd[@]}"
    printf '\n'
    continue
  fi

  if [ "${state}" = "unchanged" ]; then
    printf '%-9s %s\n' "unchanged" "${name}"
    continue
  fi
  if "${cmd[@]}" </dev/null >/dev/null; then
    printf '%-9s %s\n' "${state}d" "${name}"
  else
    printf '%-9s %s\n' "FAILED" "${name}" >&2
    n_failed=$((n_failed + 1))
  fi
done <<<"${records}"

printf 'sync-labels: %d labels in file: %d to create, %d to update, %d unchanged\n' \
  "${total}" "${n_create}" "${n_update}" "${n_same}"

if [ "${apply}" != 1 ]; then
  printf 'sync-labels: DRY RUN -- nothing was written. Re-run with --apply to write.\n'
  exit 0
fi
if [ "${n_failed}" -gt 0 ]; then
  printf 'sync-labels: %d gh call(s) failed\n' "${n_failed}" >&2
  exit 1
fi
exit 0
