import fs from "node:fs";
import path from "node:path";
import { parseAst, transformWithOxc } from "vite";
import { moduleFileAt } from "./context.ts";

// What a module exports, read off its code.

// An exported name: an identifier or a string.
function nameOf(node: object): string {
  return "name" in node ? String(node.name) : "value" in node ? String(node.value) : "";
}

// The names a pattern binds, like `{ a, b: [c] }`.
function bound(pattern: object | null, names: Set<string>): void {
  if (!pattern || !("type" in pattern)) return;
  if (pattern.type === "Identifier") names.add(nameOf(pattern));
  for (const key of ["properties", "elements", "value", "argument", "left"] as const) {
    const child = (pattern as Record<string, unknown>)[key];
    for (const part of [child].flat()) if (typeof part === "object") bound(part, names);
  }
}

/**
 * The names an ES module exports in its own code, `default` among them, and
 * the modules of its `export *`. Of JavaScript, like Next's compiled files and
 * the modules the plugin generates.
 */
export function declaredExports(code: string): { names: Set<string>; stars: string[] } {
  const names = new Set<string>();
  const stars: string[] = [];
  for (const node of parseAst(code).body) {
    if (node.type === "ExportDefaultDeclaration") names.add("default");
    else if (node.type === "ExportAllDeclaration") {
      if (node.exported) names.add(nameOf(node.exported));
      else stars.push(node.source.value);
    } else if (node.type === "ExportNamedDeclaration") {
      for (const specifier of node.specifiers) names.add(nameOf(specifier.exported));
      const { declaration } = node;
      if (declaration?.type === "VariableDeclaration") {
        for (const { id } of declaration.declarations) bound(id, names);
      } else if (declaration && "id" in declaration && declaration.id) {
        names.add(nameOf(declaration.id));
      }
    }
  }
  return { names, stars };
}

/**
 * What an ES module of Next exports: declared there, exported apart from its
 * declaration, or from another module of Next with `export ... from` or
 * `export *`. A module of CommonJS has none here.
 */
export function exportNamesOf(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const { names, stars } = declaredExports(fs.readFileSync(file, "utf8"));
  for (const star of stars) {
    const from = star.startsWith(".") && moduleFileAt(path.resolve(path.dirname(file), star));
    if (!from) continue;
    // `export *` passes on every name but `default`.
    for (const name of exportNamesOf(from, seen)) if (name !== "default") names.add(name);
  }
  return names;
}

/** Whether an ES module of Next exports a name: see `exportNamesOf()`. */
export const hasExport = (file: string, name: string): boolean => exportNamesOf(file).has(name);

/**
 * What a module of the app exports, read off its code: the names, `default`
 * among them, and the modules of its `export *`, whose names are theirs.
 */
export async function exportsOf(
  code: string,
  file: string,
): Promise<{ names: Set<string>; stars: string[] }> {
  const compiled = await transformWithOxc(code, file, { sourcemap: false });
  return declaredExports(compiled.code);
}

// The exports of a module of the app, without what they are: `undefined`.
export async function exportStubs(code: string, file: string): Promise<string> {
  const { names, stars } = await exportsOf(code, file);
  const named = [...names].filter((name) => /^[\w$]+$/.test(name) && name !== "default");
  return (
    (named.length > 0
      ? `const _ = undefined;\nexport { ${named.map((name) => `_ as ${name}`).join(", ")} };\n`
      : "") +
    (names.has("default") ? "export default undefined;\n" : "") +
    // Its names are in the other module, which this one has to load for them.
    stars.map((star) => `export * from ${JSON.stringify(star)};\n`).join("")
  );
}
