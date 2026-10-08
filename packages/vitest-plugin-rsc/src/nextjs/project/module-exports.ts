import fs from "node:fs";
import path from "node:path";
import { parseAst, transformWithOxc } from "vite";
import { moduleFileAt } from "./context.ts";

// What a module exports, read off its code.

// An exported name: an identifier or a string.
function nameOf(node: object): string {
  return "name" in node ? String(node.name) : "value" in node ? String(node.value) : "";
}

/**
 * Whether an ES module of Next exports a name: declared there, exported apart
 * from its declaration, or from another module with `export ... from` or
 * `export *`.
 */
export function hasExport(file: string, name: string, seen = new Set<string>()): boolean {
  if (seen.has(file)) return false;
  seen.add(file);
  const stars: string[] = [];
  for (const node of parseAst(fs.readFileSync(file, "utf8")).body) {
    if (node.type === "ExportAllDeclaration") {
      if (!node.exported) stars.push(node.source.value);
      else if (nameOf(node.exported) === name) return true;
    } else if (node.type === "ExportNamedDeclaration") {
      if (node.specifiers.some((specifier) => nameOf(specifier.exported) === name)) return true;
      const { declaration } = node;
      const declared =
        declaration?.type === "VariableDeclaration"
          ? declaration.declarations.map(({ id }) => id)
          : declaration && "id" in declaration
            ? [declaration.id]
            : [];
      if (declared.some((id) => id?.type === "Identifier" && id.name === name)) return true;
    }
  }
  return stars.some((star) => {
    const from = star.startsWith(".") && moduleFileAt(path.resolve(path.dirname(file), star));
    return Boolean(from) && hasExport(from as string, name, seen);
  });
}

// The exports of a module of the app, without what they are: `undefined`.
export async function exportStubs(code: string, file: string): Promise<string> {
  const compiled = await transformWithOxc(code, file, { sourcemap: false });
  const names = new Set<string>();
  const stars: string[] = [];
  // The names a pattern binds, like `{ a, b: [c] }`.
  const bound = (pattern: object | null): void => {
    if (!pattern || !("type" in pattern)) return;
    if (pattern.type === "Identifier") names.add(nameOf(pattern));
    for (const key of ["properties", "elements", "value", "argument", "left"] as const) {
      const child = (pattern as Record<string, unknown>)[key];
      for (const part of [child].flat()) if (typeof part === "object") bound(part);
    }
  };
  for (const node of parseAst(compiled.code).body) {
    if (node.type === "ExportDefaultDeclaration") names.add("default");
    else if (node.type === "ExportAllDeclaration") {
      if (node.exported) names.add(nameOf(node.exported));
      // Its names are in the other module, which this one has to load for them.
      else stars.push(`export * from ${JSON.stringify(node.source.value)};\n`);
    } else if (node.type === "ExportNamedDeclaration") {
      for (const specifier of node.specifiers) names.add(nameOf(specifier.exported));
      const { declaration } = node;
      if (declaration?.type === "VariableDeclaration") {
        for (const { id } of declaration.declarations) bound(id);
      } else if (declaration && "id" in declaration && declaration.id) {
        names.add(nameOf(declaration.id));
      }
    }
  }
  const named = [...names].filter((name) => /^[\w$]+$/.test(name) && name !== "default");
  return (
    (named.length > 0
      ? `const _ = undefined;\nexport { ${named.map((name) => `_ as ${name}`).join(", ")} };\n`
      : "") +
    (names.has("default") ? "export default undefined;\n" : "") +
    stars.join("")
  );
}
