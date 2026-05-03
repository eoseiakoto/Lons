#!/usr/bin/env bash
# Asserts that pairs of files marked "SYNCED FILE" stay byte-identical
# between admin-portal and platform-portal. Add new pairs below as the
# design system grows.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PAIRS=(
  "apps/admin-portal/src/components/dashboard/page-backdrop.tsx|apps/platform-portal/src/components/dashboard/page-backdrop.tsx"
  "apps/admin-portal/src/components/ui/sparkline.tsx|apps/platform-portal/src/components/ui/sparkline.tsx"
  "apps/admin-portal/src/components/ui/area-chart.tsx|apps/platform-portal/src/components/ui/area-chart.tsx"
  "apps/admin-portal/src/components/ui/gauge.tsx|apps/platform-portal/src/components/ui/gauge.tsx"
  "apps/admin-portal/src/components/ui/progress-bar.tsx|apps/platform-portal/src/components/ui/progress-bar.tsx"
  "apps/admin-portal/src/components/ui/filter-pill.tsx|apps/platform-portal/src/components/ui/filter-pill.tsx"
  "apps/admin-portal/src/components/ui/slide-over.tsx|apps/platform-portal/src/components/ui/slide-over.tsx"
  "apps/admin-portal/src/components/ui/page-header.tsx|apps/platform-portal/src/components/ui/page-header.tsx"
  "apps/admin-portal/src/lib/mobile-nav-context.tsx|apps/platform-portal/src/lib/mobile-nav-context.tsx"
)

failed=0
for pair in "${PAIRS[@]}"; do
  IFS='|' read -r a b <<< "$pair"
  if [[ ! -f "$ROOT/$a" || ! -f "$ROOT/$b" ]]; then
    echo "MISSING: $a or $b"
    failed=1
    continue
  fi
  if ! diff -q "$ROOT/$a" "$ROOT/$b" >/dev/null; then
    echo "DRIFT: $a vs $b"
    diff "$ROOT/$a" "$ROOT/$b" | head -40
    failed=1
  fi
done

if [[ $failed -eq 0 ]]; then
  echo "OK: ${#PAIRS[@]} synced pairs in lockstep."
fi
exit $failed
