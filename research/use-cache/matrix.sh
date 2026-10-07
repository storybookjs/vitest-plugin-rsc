#!/bin/bash
# matrix.sh <variant>...: runs the "use cache" spike tests per variant and prints pass/fail per test.
for v in "$@"; do
  ./run.sh $v app/use-cache.test.tsx --reporter=verbose > run-$v.log 2>&1
  echo "== $v: $(grep -E '^\s+Tests ' run-$v.log | sed 's/^ *//')"
  grep -E "^\s+(✓|×) " run-$v.log | sed -E 's/\|next-e2e-demo \(chromium\)\| app\/use-cache.test.tsx > //; s/ [0-9]+ms$//' 
done
