"""Compares runs of the benchmark of primitives: bench-results/<label>.json.

    python3 bench/compare.py bench-results/default.json bench-results/fast.json
    python3 bench/compare.py --stat p90 old.json new.json

Prints a Markdown table: the median (or --stat) of every primitive and of its
parts in each run, and the last run over the first. For runs of two commits,
or of two modes: the default mode against fast mode. Then the startup marks
of each run, in ms since the start.
"""

import argparse
import json
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("runs", nargs="+", help="bench-results/<label>.json files")
    parser.add_argument("--stat", default="median", choices=["min", "median", "p90", "max", "first"])
    args = parser.parse_args()
    runs = [json.load(open(path)) for path in args.runs]
    labels = [f"{run['label']} ({run.get('commit') or '?'})" for run in runs]

    names: list[str] = []
    values: dict[str, list[float | None]] = {}
    for index, run in enumerate(runs):
        for row in run["rows"]:
            lines = [(row["name"], row["total"])]
            lines += [(f"{row['name']} ↳ {part}", stats) for part, stats in row["parts"].items()]
            for name, stats in lines:
                if name not in values:
                    names.append(name)
                    values[name] = [None] * len(runs)
                values[name][index] = stats[args.stat]

    # Runs of two modes, several of each: the ratio of their means. Else the
    # last run over the first.
    modes = list(dict.fromkeys(run["mode"] for run in runs))
    grouped = len(modes) == 2 and len(runs) > 2
    if grouped:
        ratio_label = f"{modes[1]} / {modes[0]}, means"
    elif len(runs) > 2:
        ratio_label = "last / first"
    else:
        ratio_label = f"{runs[-1]['label']} / {runs[0]['label']}"
    print(f"| Primitive, {args.stat} ms | " + " | ".join(labels) + f" | {ratio_label} |")
    print("| --- |" + " ---: |" * (len(runs) + 1))

    def mean(row: list[float | None], mode: str) -> float | None:
        found = [value for value, run in zip(row, runs) if run["mode"] == mode and value is not None]
        return sum(found) / len(found) if found else None

    for name in sorted(names, key=lambda name: name.split(" ↳ ")[0]):
        row = values[name]
        first, final = (mean(row, modes[0]), mean(row, modes[1])) if grouped else (row[0], row[-1])
        ratio = f"{final / first:.2f}" if first and final is not None else ""
        cells = " | ".join("" if value is None else f"{value:.2f}" for value in row)
        print(f"| {name} | {cells} | {ratio} |")

    print()
    print("| Startup mark, ms since start | " + " | ".join(labels) + " |")
    print("| --- |" + " ---: |" * len(runs))
    marks: list[str] = []
    times: dict[str, list[float | None]] = {}
    for index, run in enumerate(runs):
        for mark in run["startup"]["marks"]:
            if mark["label"] not in times:
                marks.append(mark["label"])
                times[mark["label"]] = [None] * len(runs)
            times[mark["label"]][index] = mark["ms"]
    for label in marks:
        cells = " | ".join("" if value is None else f"{value:.0f}" for value in times[label])
        print(f"| {label} | {cells} |")


if __name__ == "__main__":
    sys.exit(main())
