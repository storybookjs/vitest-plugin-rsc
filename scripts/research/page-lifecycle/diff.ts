// Compares two heap snapshots of the tab by what their objects are: their
// type and constructor or name. Prints what grew most, by size.
//
//   node --max-old-space-size=8192 \
//     scripts/research/page-lifecycle/diff.ts <before> <after> [count]
import { readFileSync } from "node:fs";

type Snapshot = {
  snapshot: { meta: { node_fields: string[]; node_types: [string[]] } };
  nodes: number[];
  strings: string[];
};

function tally(file: string) {
  const heap = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  const { node_fields: fields, node_types: types } = heap.snapshot.meta;
  const [typeAt, nameAt, sizeAt] = ["type", "name", "self_size"].map((f) => fields.indexOf(f));
  const byKind = new Map<string, { count: number; size: number }>();
  for (let at = 0; at < heap.nodes.length; at += fields.length) {
    const type = types[0][heap.nodes[at + typeAt!]!]!;
    // A string's name is its value: by length, not by content.
    const raw = heap.strings[heap.nodes[at + nameAt!]!]!;
    const name = type === "string" || type === "concatenated string" ? "" : raw.slice(0, 60);
    const key = `${type} ${name}`;
    const kind = byKind.get(key) ?? { count: 0, size: 0 };
    kind.count++;
    kind.size += heap.nodes[at + sizeAt!]!;
    byKind.set(key, kind);
  }
  return byKind;
}

const [before, after, count = "25"] = process.argv.slice(2);
if (!before || !after) throw new Error("usage: diff.ts <before> <after> [count]");
const was = tally(before);
const is = tally(after);
const rows = [...is].map(([key, { count, size }]) => {
  const old = was.get(key) ?? { count: 0, size: 0 };
  return { key, count: count - old.count, size: size - old.size };
});
const total = rows.reduce((sum, row) => sum + row.size, 0);
console.log(`grew by ${(total / 1024).toFixed(0)} KB`);
for (const row of rows.sort((a, b) => b.size - a.size).slice(0, Number(count))) {
  console.log(
    `${(row.size / 1024).toFixed(1).padStart(9)} KB ${String(row.count).padStart(7)}  ${row.key}`,
  );
}
