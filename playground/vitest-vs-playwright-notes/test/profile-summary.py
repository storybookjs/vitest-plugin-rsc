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
    if name.startswith("react-server-dom"):
        return "React Flight (server)" if "server" in os.path.basename(path) else "React Flight (client)"
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


totals = collections.Counter()
functions = collections.Counter()
for file in profiles:
    with open(file) as handle:
        profile = json.load(handle)
    nodes = {node["id"]: node for node in profile["nodes"]}
    for node_id, delta in zip(profile["samples"], profile["timeDeltas"]):
        frame = nodes[node_id]["callFrame"]
        seconds = max(delta, 0) / 1e6
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
