#!/bin/bash
# Read-only download of the upstream plugin-rsc use-cache examples.
set -e
out=/tmp/uc-research/upstream
for p in \
  examples/use-cache/vite.config.ts \
  examples/use-cache/README.md \
  examples/use-cache/src/framework/use-cache-runtime.tsx \
  examples/use-cache/src/features/captured-values/server.tsx \
  examples/use-cache/src/features/cached-component/server.tsx \
  examples/use-cache-callable/README.md \
  examples/use-cache-callable/callable-cache-plugin.ts \
  examples/use-cache-callable/vite.config.ts \
  examples/use-cache-callable/src/framework/use-cache-runtime.tsx \
  examples/use-cache-persistent/README.md \
  examples/use-cache-persistent/src/framework/use-cache-runtime.tsx \
  src/transforms/fixtures/mixed-directives/use-cache-in-use-server.js.snap.md \
  src/transforms/fixtures/mixed-directives/use-server-in-use-cache.js.snap.md
do
  mkdir -p "$out/$(dirname "$p")"
  gh api "repos/vitejs/vite-plugin-react/contents/packages/plugin-rsc/$p" --jq .content | base64 -d > "$out/$p"
done
wc -l $(find $out -type f)
