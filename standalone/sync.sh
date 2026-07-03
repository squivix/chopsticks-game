#!/usr/bin/env bash
# Keep the standalone build's verbatim copies in step with web/src.
#
#   ./sync.sh          copy the current web/src sources over the copies here
#   ./sync.sh --check  fail (non-zero) if any copy has drifted from its source
#
# Only the files listed below are plain copies. index.html is maintained by
# hand (it inlines the web/src/components/*.vue templates), so it's not tracked
# here — mirror component markup changes into it yourself.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web="$here/../web/src"

# dest (relative to standalone/) <- source (relative to web/src/)
files=(
  "styles.css:styles.css"
  "composables/useChopsticks.js:composables/useChopsticks.js"
  "lib/engine.js:lib/engine.js"
  "lib/solver.js:lib/solver.js"
  "lib/cpu.js:lib/cpu.js"
  "lib/hand-svg.js:lib/hand-svg.js"
  "lib/format.js:lib/format.js"
  "lib/rule-fields.js:lib/rule-fields.js"
)

check=0
[[ "${1:-}" == "--check" ]] && check=1

drift=()
for pair in "${files[@]}"; do
  dest="$here/${pair%%:*}"
  src="$web/${pair##*:}"
  if [[ ! -f "$src" ]]; then
    echo "sync: missing source $src" >&2
    exit 2
  fi
  if [[ "$check" == 1 ]]; then
    cmp -s "$src" "$dest" || drift+=("${pair%%:*}")
  else
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
  fi
done

if [[ "$check" == 1 ]]; then
  if [[ ${#drift[@]} -gt 0 ]]; then
    echo "standalone/ is out of sync with web/src — drifted files:" >&2
    printf '  standalone/%s\n' "${drift[@]}" >&2
    echo "Run standalone/sync.sh to refresh them." >&2
    exit 1
  fi
  echo "standalone/ is in sync with web/src."
else
  echo "standalone/ refreshed from web/src (${#files[@]} files)."
fi
