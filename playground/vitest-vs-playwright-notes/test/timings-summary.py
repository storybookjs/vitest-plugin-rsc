"""Sums up the timings of `VITEST_PROFILE=timings` (test/profile.ts), in timings/, as Markdown.

Where the time of the tests went: each request of the page from the moment
it reached the server, split into its wait for the request before it, the
server's work before its render of Flight, that render (by React's Flight
server, with the queries of the database in it), and the rest until the
response was done; and outside of the requests, the page itself: the clicks,
Next's router, decoding Flight, React, the assertions.

    python3 test/timings-summary.py [timings/]
"""

import collections
import glob
import json
import os
import sys

files = sorted(glob.glob(os.path.join(sys.argv[1] if len(sys.argv) > 1 else "timings", "*.json")))
if not files:
    sys.exit("No timings: run vitest with VITEST_PROFILE=timings -c vitest.profile.config.ts first.")


def overlap(spans, start, end):
    return sum(max(0.0, min(e, end) - max(s, start)) for s, e in spans)


def inside(spans, start, end):
    return [(max(s, start), min(e, end)) for s, e in spans if e > start and s < end]


totals = collections.defaultdict(collections.Counter)
counts = collections.Counter()
test_time = 0.0
in_requests = 0.0
tests = 0
for file in files:
    with open(file) as handle:
        timings = json.load(handle)
    test_spans = [tuple(span) for span in timings["tests"]]
    renders = [tuple(render) for render in timings["flight"]]
    flight = [(start, read) for start, _, read in renders]
    queries = [tuple(span) for span in timings["queries"]]
    tests += len(test_spans)
    test_time += sum(e - s for s, e in test_spans)
    for request in timings["requests"] or []:
        queued, started = request["queued"], request.get("started")
        finished = request.get("finished") or request.get("answered")
        if started is None or finished is None:
            continue
        # Only what happened during a test, as the tests' time is the total.
        if overlap(test_spans, queued, finished) <= 0:
            continue
        kind = request["kind"]
        counts[kind] += 1
        in_requests += overlap(test_spans, queued, finished)
        spans = inside(flight, started, finished)
        first_render = min((s for s, _ in spans), default=finished)
        last_render = max((e for _, e in spans), default=first_render)
        phase = totals[kind]
        phase["1 waiting for the request before"] += started - queued
        phase["2 server before Flight (routing, the action)"] += first_render - started
        phase["2a of which database"] += overlap(queries, started, first_render)
        written = max((w for s, w, _ in renders if s >= started and w <= finished), default=last_render)
        phase["3 Flight render, until React wrote its last byte"] += max(0.0, written - first_render)
        phase["3a of which database"] += overlap(queries, first_render, written)
        phase["3b then until it was read to the end (Next's pipeline, the plugin, the page)"] += max(0.0, last_render - written)
        phase["4 server after Flight, until the response is done"] += finished - last_render

print(f"Timings of {tests} tests in {len(files)} test files: {test_time / 1000:.1f} s of tests.\n")
print(
    f"Of which in requests of the page: {in_requests / 1000:.1f} s "
    f"({100 * in_requests / test_time:.0f}%); the rest is the page itself: the clicks, "
    f"Next's router, decoding Flight, React and the assertions: "
    f"{(test_time - in_requests) / 1000:.1f} s ({100 * (test_time - in_requests) / test_time:.0f}%).\n"
)
names = {"action": "Server Actions", "flight": "Navigations (Flight)", "page": "Page loads"}
for kind in ("action", "flight", "page"):
    if not counts[kind]:
        continue
    phase = totals[kind]
    print(f"**{names[kind]}**: {counts[kind]}\n")
    print("| Phase | Total s | ms each |")
    print("| --- | ---: | ---: |")
    for key in sorted(phase):
        print(f"| {key} | {phase[key] / 1000:.1f} | {phase[key] / counts[kind]:.1f} |")
    print()
