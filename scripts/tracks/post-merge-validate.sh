#!/usr/bin/env bash
# Post-merge validation after Sprint C tracks are merged
# Run this after EACH track merge, and once more after all tracks are merged
#
# Usage: bash scripts/tracks/post-merge-validate.sh

set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== Post-Merge Validation ==="
echo ""

FAILED=0

# 1. Prisma schema validation
echo "1. Prisma schema validation..."
if bash scripts/prisma-generate.sh >/dev/null 2>&1; then
  echo "   ✓ Prisma schema valid"
else
  echo "   ✗ Prisma schema INVALID"
  FAILED=$((FAILED + 1))
fi

# 2. TypeScript type check
echo "2. TypeScript build..."
if source scripts/env.sh && bun run build >/dev/null 2>&1; then
  echo "   ✓ Build successful (0 type errors)"
else
  echo "   ✗ Build FAILED"
  FAILED=$((FAILED + 1))
fi

# 3. Test suite
echo "3. Running test suite..."
TEST_OUTPUT=$(bash scripts/test.sh --no-coverage 2>&1)
SUITES=$(echo "$TEST_OUTPUT" | grep "Test Suites:" | tail -1)
TESTS=$(echo "$TEST_OUTPUT" | grep "Tests:" | tail -1)
if echo "$TEST_OUTPUT" | grep -q "Test Suites:.*failed"; then
  echo "   ✗ Tests FAILED: $SUITES"
  FAILED=$((FAILED + 1))
else
  echo "   ✓ $SUITES"
  echo "   ✓ $TESTS"
fi

# 4. i18n consistency
echo "4. i18n dictionary consistency..."
I18N_RESULT=$(python3 -c "
import re, glob
total_problems = 0
for dict_file in glob.glob('src/i18n/dictionaries/*.ts'):
    with open(dict_file) as f:
        content = f.read()
    all_keys = re.findall(r'\"(\w+\.\w+)\"', content)
    if not all_keys:
        continue
    from collections import Counter
    counts = Counter(all_keys)
    problems = {k: v for k, v in counts.items() if v != 4 and v > 1}
    if problems:
        for k, v in problems.items():
            print(f'  PROBLEM in {dict_file}: {k} appears {v}x (expected 4)')
            total_problems += 1
if total_problems == 0:
    print('CONSISTENT')
else:
    print(f'{total_problems} PROBLEMS')
" 2>&1)

if echo "$I18N_RESULT" | grep -q "CONSISTENT"; then
  echo "   ✓ All translation keys consistent"
else
  echo "   ✗ i18n problems found:"
  echo "$I18N_RESULT" | head -10
  FAILED=$((FAILED + 1))
fi

# 5. Middleware security check
echo "5. Middleware security..."
if grep -q "api/v1" src/middleware.ts 2>/dev/null; then
  echo "   ✓ API v1 routes referenced in middleware"
else
  echo "   ⚠ No API v1 reference in middleware (okay if Track 3 not yet merged)"
fi

# 6. No uncommitted changes
echo "6. Working tree clean..."
if git diff --quiet HEAD 2>/dev/null; then
  echo "   ✓ No uncommitted changes"
else
  echo "   ⚠ Uncommitted changes present"
fi

echo ""
if [ $FAILED -eq 0 ]; then
  echo "=== ALL CHECKS PASSED ✓ ==="
else
  echo "=== $FAILED CHECK(S) FAILED ✗ ==="
  exit 1
fi
