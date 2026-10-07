#!/bin/bash
# run.sh <variant> [vitest args...]: runs the demo suite from source with a private API port.
cd /Users/kasperpeulen/code/github/storybookjs/vitest-plugin-rsc/.claude/worktrees/agent-af4b1127992764e28
variant=$1; shift
rm -rf playground/next-e2e-demo/node_modules/.vite node_modules/.vite
VITE_SPIKE_CTX=$variant NODE_OPTIONS='--conditions=vitest-plugin-rsc-source' pnpm exec vitest run --configLoader native --project next-e2e-demo --api.port=51731 "$@" 2>&1 | grep -v "vitest:mocks:interceptor"
