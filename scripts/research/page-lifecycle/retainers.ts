// Reads a heap snapshot of the tab and prints, for every closure named
// `name` (by default `callServer`, one per page that is still in memory),
// the shortest path that keeps it from the roots: what a `--debug-leaks`
// mode of the plugin would print for a page that was left.
//
//   node --max-old-space-size=8192 \
//     scripts/research/page-lifecycle/retainers.ts <file> [name]
import { readFileSync } from "node:fs";

type Snapshot = {
  snapshot: {
    meta: {
      node_fields: string[];
      node_types: [string[], ...unknown[]];
      edge_fields: string[];
      edge_types: [string[], ...unknown[]];
    };
  };
  nodes: number[];
  edges: number[];
  strings: string[];
};

const [file, name = "callServer"] = process.argv.slice(2);
if (!file) throw new Error("usage: retainers.ts <file> [closure name]");
const heap = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
const { meta } = heap.snapshot;
const nodeFields = meta.node_fields.length;
const edgeFields = meta.edge_fields.length;
const nodeTypes = meta.node_types[0];
const edgeTypes = meta.edge_types[0];
const at = (field: string) => meta.node_fields.indexOf(field);
const [typeAt, nameAt, idAt, sizeAt, edgeCountAt] = [
  at("type"),
  at("name"),
  at("id"),
  at("self_size"),
  at("edge_count"),
];
const nodeCount = heap.nodes.length / nodeFields;

// Where the edges of each node start.
const firstEdge = new Uint32Array(nodeCount + 1);
for (let node = 0; node < nodeCount; node++) {
  firstEdge[node + 1] = firstEdge[node]! + heap.nodes[node * nodeFields + edgeCountAt]!;
}

const typeOf = (node: number) => nodeTypes[heap.nodes[node * nodeFields + typeAt]!]!;
const nameOf = (node: number) => heap.strings[heap.nodes[node * nodeFields + nameAt]!]!;
const describe = (node: number) => {
  const label = nameOf(node).replace(/\s+/g, " ").slice(0, 70);
  return `${typeOf(node)} ${label} @${heap.nodes[node * nodeFields + idAt]}`;
};
const edgeName = (edge: number) => {
  const type = edgeTypes[heap.edges[edge * edgeFields]!]!;
  const value = heap.edges[edge * edgeFields + 1]!;
  const label = type === "element" || type === "hidden" ? `[${value}]` : heap.strings[value];
  return `${type}:${label}`;
};

// Breadth first from the root, over strong edges: the shortest retainers.
const parentEdge = new Int32Array(nodeCount).fill(-1);
const parentNode = new Int32Array(nodeCount).fill(-1);
const seen = new Uint8Array(nodeCount);
const queue = new Uint32Array(nodeCount);
let head = 0;
let tail = 0;
queue[tail++] = 0;
seen[0] = 1;
while (head < tail) {
  const node = queue[head++]!;
  for (let edge = firstEdge[node]!; edge < firstEdge[node + 1]!; edge++) {
    if (edgeTypes[heap.edges[edge * edgeFields]!] === "weak") continue;
    const to = heap.edges[edge * edgeFields + 2]! / nodeFields;
    if (seen[to]) continue;
    seen[to] = 1;
    parentEdge[to] = edge;
    parentNode[to] = node;
    queue[tail++] = to;
  }
}

let totalSize = 0;
for (let node = 0; node < nodeCount; node++) totalSize += heap.nodes[node * nodeFields + sizeAt]!;
console.log(`${nodeCount} nodes, ${(totalSize / 2 ** 20).toFixed(1)} MB`);

const targets: number[] = [];
for (let node = 0; node < nodeCount; node++) {
  if (typeOf(node) === "closure" && nameOf(node) === name) targets.push(node);
}
console.log(`${targets.length} closures named ${name}`);
for (const target of targets) {
  const path: string[] = [];
  for (let node = target; parentNode[node]! >= 0; node = parentNode[node]!) {
    path.push(`  ${describe(parentNode[node]!)}  --${edgeName(parentEdge[node]!)}-->`);
  }
  console.log(`\n${describe(target)}${seen[target] ? "" : " (only weakly held)"}`);
  console.log(path.reverse().join("\n"));
}
