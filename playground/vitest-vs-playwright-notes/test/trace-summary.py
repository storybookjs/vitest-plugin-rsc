"""Sums up the traces of `VITEST_PROFILE=trace` (vitest.profile.config.ts), in traces/, as Markdown.

The time of the page's main thread, by what the browser did: run
JavaScript, run the microtasks of promises, lay out, style, paint, collect
garbage. Each event counts for its own time, without the events inside it.

    python3 test/trace-summary.py [traces/]
"""

import collections
import glob
import json
import os
import sys

traces = sorted(glob.glob(os.path.join(sys.argv[1] if len(sys.argv) > 1 else "traces", "*.json")))
if not traces:
    sys.exit("No traces: run vitest with VITEST_PROFILE=trace -c vitest.profile.config.ts first.")

totals = collections.Counter()
span = 0.0
for file in traces:
    with open(file) as handle:
        events = json.load(handle)
    names = {}
    for event in events:
        if event.get("ph") == "M" and event.get("name") == "thread_name":
            names[(event["pid"], event["tid"])] = event["args"]["name"]
    by_thread = collections.defaultdict(list)
    for event in events:
        if event.get("ph") == "X" and "dur" in event:
            by_thread[(event["pid"], event["tid"])].append(event)
    # The renderer's main thread with the most events: the page of the tests.
    main = max(
        (thread for thread in by_thread if names.get(thread) == "CrRendererMain"),
        key=lambda thread: len(by_thread[thread]),
    )
    ordered = sorted(by_thread[main], key=lambda event: (event["ts"], -event["dur"]))
    span += (max(event["ts"] + event["dur"] for event in ordered) - ordered[0]["ts"]) / 1e6
    stack = []
    for event in ordered:
        start, end = event["ts"], event["ts"] + event["dur"]
        while stack and stack[-1][1] <= start:
            stack.pop()
        if stack:
            totals[stack[-1][2]] -= (min(end, stack[-1][1]) - start) / 1e6
        totals[event["name"]] += (end - start) / 1e6
        stack.append((start, end, event["name"]))

busy = sum(seconds for seconds in totals.values() if seconds > 0)
print(f"Trace of Chrome, {len(traces)} test files: {span:.1f} s, of which the main thread was busy {busy:.1f} s.\n")
print("| What the main thread did | Seconds | Share of busy |")
print("| --- | ---: | ---: |")
for name, seconds in totals.most_common(30):
    if seconds >= 0.01:
        print(f"| `{name}` | {seconds:.2f} | {100 * seconds / busy:.1f}% |")
