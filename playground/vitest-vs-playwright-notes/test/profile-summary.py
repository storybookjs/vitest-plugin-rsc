"""Sums up the CPU profiles of vitest.profile.config.ts, in profiles/, as Markdown.

Each sample counts for what was running: a package of a pre-bundled
dependency, by the `//#region` comments that Rolldown writes around the code
of each file it bundles; the plugin; the app; or the browser itself, which a
profile names `(program)`, `(garbage collector)` and `(idle)`.

    python3 test/profile-summary.py [profiles/]
"""

import bisect
import collections
import glob
import json
import os
import re
import sys
from urllib.parse import unquote, urlparse

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
profiles = sorted(glob.glob(os.path.join(sys.argv[1] if len(sys.argv) > 1 else "profiles", "*.cpuprofile")))
if not profiles:
    sys.exit("No profiles: run vitest with -c vitest.profile.config.ts first.")

regions_of_file = {}


def regions(path):
    """The regions of a bundled file: (first line, last line, source), by line."""
    if path not in regions_of_file:
        found = []
        try:
            with open(path, encoding="utf-8", errors="replace") as file:
                start, source = None, None
                for number, line in enumerate(file):
                    if line.startswith("//#region "):
                        start, source = number, line[len("//#region "):].strip()
                    elif line.startswith("//#endregion") and start is not None:
                        found.append((start, number, source))
                        start = None
        except OSError:
            pass
        regions_of_file[path] = (found, [region[0] for region in found])
    return regions_of_file[path]


def package_of(source):
    """`next (server)`, `react-dom (client)`, `@electric-sql/pglite`, … of a path in node_modules."""
    # React's Flight, also the copies that Next and Vite RSC vendor: its
    # client is `react-server-dom-webpack-client.*.js`, "server" and all.
    if "react-server-dom" in source:
        client = "client" in os.path.basename(source)
        return "React Flight (client)" if client else "React Flight (server)"
    if "node_modules/" not in source:
        return "vitest-plugin-rsc" if "vitest-plugin-rsc" in source else "other: " + os.path.basename(source)
    rest = source.rsplit("node_modules/", 1)[-1]
    parts = rest.split("/")
    name = "/".join(parts[:2]) if parts[0].startswith("@") else parts[0]
    path = "/".join(parts[2:] if parts[0].startswith("@") else parts[1:])
    if name == "next":
        compiled = re.match(r"dist/compiled/([^/]+)/", path)
        if compiled:
            name, path = compiled.group(1), path
        elif re.search(r"/server/|/build/|/api/|/lib/", "/" + path):
            return "next (server)"
        elif "/client/" in "/" + path:
            return "next (client)"
        else:
            return "next (shared)"
    if name == "react-dom":
        return "react-dom (server)" if "server" in os.path.basename(path) else "react-dom (client)"
    return name


def category(frame):
    function, url, line = frame["functionName"], frame["url"], frame["lineNumber"]
    if function in ("(program)", "(garbage collector)", "(idle)", "(root)"):
        return function
    if not url:
        return "browser APIs (native)"
    path = unquote(urlparse(url).path)
    if path.endswith(".wasm") or url.startswith("wasm://"):
        return "@electric-sql/pglite (wasm)" if "pglite" in path or url.startswith("wasm://") else "wasm"
    if "virtual:vitest-plugin-rsc" in path or "/vitest-plugin-rsc/dist/" in path:
        return "vitest-plugin-rsc"
    if "/@vitest/" in path or "__vitest" in path or re.search(r"/vitest/dist/", path):
        return "vitest"
    if path.startswith("/@fs/"):
        path = path[len("/@fs"):]
    elif not os.path.isabs(path) or not os.path.exists(path):
        path = os.path.join(root, path.lstrip("/"))
    if "/node_modules/.vite/" in path:
        found, starts = regions(path)
        at = bisect.bisect_right(starts, line) - 1
        if at >= 0 and found[at][1] >= line:
            return package_of(found[at][2])
        return "pre-bundled (unknown)"
    if "/node_modules/" in path:
        return package_of(path)
    relative = os.path.relpath(path, root)
    if relative.startswith(("tests/", "test/")):
        return "test code"
    if relative.startswith(("app/", "lib/", "components/")):
        return "app code"
    return "other: " + os.path.basename(path)


def samples(profile):
    """(node, time, seconds) of each sample, but the first: its delta is the
    wait from `Profiler.start` until sampling began, hundreds of ms of nothing."""
    at = profile["startTime"]
    for index, (node_id, delta) in enumerate(zip(profile["samples"], profile["timeDeltas"])):
        at += delta
        if index:
            yield node_id, at, max(delta, 0) / 1e6


totals = collections.Counter()
functions = collections.Counter()
for file in profiles:
    with open(file) as handle:
        profile = json.load(handle)
    nodes = {node["id"]: node for node in profile["nodes"]}
    for node_id, _, seconds in samples(profile):
        frame = nodes[node_id]["callFrame"]
        kind = category(frame)
        totals[kind] += seconds
        if kind not in ("(program)", "(garbage collector)", "(idle)", "(root)"):
            functions[(frame["functionName"] or "(anonymous)", kind)] += seconds

total = sum(totals.values())
print(f"CPU profile of the page, {len(profiles)} test files, {total:.1f} s sampled.\n")
print("| What ran | Seconds | Share |")
print("| --- | ---: | ---: |")
for kind, seconds in totals.most_common():
    if seconds >= 0.05:
        print(f"| {kind} | {seconds:.1f} | {100 * seconds / total:.1f}% |")
print("\nThe functions that took longest themselves:\n")
print("| Function | Of | Seconds |")
print("| --- | --- | ---: |")
for (function, kind), seconds in functions.most_common(25):
    print(f"| `{function}` | {kind} | {seconds:.2f} |")


# With the timings of test/profile.ts next to a profile, what ran in each
# phase of the tests: each sample by the phase it fell in.
def phases_of(timings):
    """(start, end, phase) of every phase, on the clock of `performance.now()`."""
    found = []
    renders = timings["flight"]
    names = {"action": "Server Action", "flight": "navigation", "page": "page load"}
    for request in timings["requests"] or []:
        queued, started = request["queued"], request.get("started")
        finished = request.get("finished") or request.get("answered")
        if started is None or finished is None:
            continue
        name = names[request["kind"]]
        inside = [r for r in renders if started <= r[0] <= finished]
        first = min((r[0] for r in inside), default=finished)
        written = max((r[1] for r in inside), default=first)
        found += [
            (queued, started, f"{name}: waiting for the request before"),
            (started, first, f"{name}: server before Flight"),
            (first, written, f"{name}: Flight render"),
            (written, finished, f"{name}: server after Flight"),
        ]
    requests = sorted(found)
    for start, end in timings["tests"]:
        found.append((start, end, "the page, outside requests"))
    # The phases of requests first: a test spans its requests.
    return requests, sorted((s, e, p) for s, e, p in found if p == "the page, outside requests")


by_phase = collections.defaultdict(collections.Counter)
for file in profiles:
    timing_file = os.path.join(root, "timings", os.path.basename(file).replace(".cpuprofile", ".json"))
    if not os.path.exists(timing_file):
        continue
    with open(timing_file) as handle:
        timings = json.load(handle)
    if timings.get("profileStart") is None:
        continue
    with open(file) as handle:
        profile = json.load(handle)
    nodes = {node["id"]: node for node in profile["nodes"]}
    requests, tests = phases_of(timings)
    request_starts = [start for start, _, _ in requests]
    test_starts = [start for start, _, _ in tests]
    # The first sample of `__profileSync()` is when it started, `profileStart`.
    syncs = (at for node_id, at, _ in samples(profile) if nodes[node_id]["callFrame"]["functionName"] == "__profileSync")
    sync = next(syncs, None)
    if sync is None:
        continue
    for node_id, at, seconds in samples(profile):
        time = timings["profileStart"] + (at - sync) / 1000
        phase = "between tests (hooks, Vitest)"
        index = bisect.bisect_right(request_starts, time) - 1
        if index >= 0 and requests[index][0] <= time < requests[index][1]:
            phase = requests[index][2]
        else:
            index = bisect.bisect_right(test_starts, time) - 1
            if index >= 0 and tests[index][0] <= time < tests[index][1]:
                phase = tests[index][2]
        by_phase[phase][category(nodes[node_id]["callFrame"])] += seconds

if by_phase:
    print("\nWhat ran in each phase of the tests, by its CPU samples:\n")
    print("| Phase | Seconds | What ran most |")
    print("| --- | ---: | --- |")
    for phase, kinds in sorted(by_phase.items(), key=lambda item: -sum(item[1].values())):
        seconds = sum(kinds.values())
        most = ", ".join(f"{kind} {100 * part / seconds:.0f}%" for kind, part in kinds.most_common(7))
        print(f"| {phase} | {seconds:.1f} | {most} |")
