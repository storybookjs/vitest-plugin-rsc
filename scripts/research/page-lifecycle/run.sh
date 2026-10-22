#!/usr/bin/env bash
# Throwaway measurement for docs/page-lifecycle-risk.md. Runs the test files
# of one directory of this one in a single tab, and keeps the `PLM` lines.
#
#   scripts/research/page-lifecycle/run.sh <name> <config> <dir> \
#     [isolate 0|1] [leak 0|1] [pages] [vitest args...]
set -euo pipefail
"$(dirname "$0")/make-files.sh"
cd "$(dirname "$0")/../../.."
name=$1 config=$2 dir=$3 isolate=${4:-0} leak=${5:-0} pages=${6:-30}
shift $(($# < 6 ? $# : 6))
out=scripts/research/page-lifecycle/results
mkdir -p "$out"
RESEARCH_DIR=$dir RESEARCH_ISOLATE=$isolate RESEARCH_LEAK=$leak \
  RESEARCH_PAGES=$pages \
  NODE_OPTIONS='--conditions=vitest-plugin-rsc-source --conditions=storybook-nextjs-vite-rsc-source' \
  npx vitest run --config "scripts/research/page-lifecycle/$config" \
  --configLoader native --silent=false --reporter=verbose "$@" \
  2>&1 | tee "$out/$name.log" | grep -E '^PLM|✓|✗|×|Test Files|Duration' || true
grep -h '^PLM ' "$out/$name.log" | sed 's/^PLM //' > "$out/$name.jsonl"
# Vitest's own summary of the run: its duration, and the errors that no test
# caught, like a timer of a page that was left.
plain=$(perl -pe 's/\e\[[0-9;]*m//g' "$out/$name.log")
duration=$(sed -n 's/^ *Duration *\([0-9.]*\)s.*/\1/p' <<<"$plain" | tail -1)
errors=$(sed -n 's/^ *Errors *\([0-9]*\) error.*/\1/p' <<<"$plain" | tail -1)
echo "{\"run\":\"$name\",\"durationS\":${duration:-null},\"unhandledErrors\":${errors:-0}}" \
  >> "$out/$name.jsonl"
