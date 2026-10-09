import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst } from "vite";
import { describe, expect, test } from "vitest";
import { assertVitestVersion } from "./nextjs/vitest-version.ts";

// Vitest is an optional peer dependency, of any version: a host other than
// Vitest, like Storybook, installs the plugin without it, or next to the
// Vitest of the project's own tests. So no file of the build imports Vitest,
// in its code or in its types, but for the setup files that the plugin gives
// Vitest by their path, which no other file imports. This reads the build,
// which is what a host installs.

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = path.join(packageDir, "dist");
const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8")) as {
  peerDependencies: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
};

/** What only Vitest loads. */
const vitestFiles = ["nextjs/setup.js", "nextjs/affected/browser.js"];

const isVitest = (specifier: string) => /^(?:vitest|@vitest\/[^/]+)(?:\/|$)/.test(specifier);

// What a module imports: with `import` and `export ... from`, with `import()`,
// and in types with `import("...")`, `declare module "..."` and a reference.
function importsOf(file: string): string[] {
  const code = fs.readFileSync(file, "utf8");
  const found = [...code.matchAll(/^\/\/\/\s*<reference\s+types="([^"]+)"/gm)].map(
    (match) => match[1]!,
  );
  const literal = (value: unknown) => {
    const { type, value: text } = (value ?? {}) as { type?: string; value?: unknown };
    if (type === "Literal" && typeof text === "string") found.push(text);
  };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== "object" || node === null) return;
    const { type, source, id } = node as { type?: string; source?: unknown; id?: unknown };
    if (
      type === "ImportDeclaration" ||
      type === "ExportNamedDeclaration" ||
      type === "ExportAllDeclaration" ||
      type === "ImportExpression" ||
      type === "TSImportType"
    ) {
      literal(source);
    }
    if (type === "TSModuleDeclaration") literal(id);
    for (const value of Object.values(node)) if (typeof value === "object") visit(value);
  };
  visit(parseAst(code, { lang: file.endsWith(".d.ts") ? "ts" : "js" }).body);
  return found;
}

// Every file of JavaScript and of types in the build, by its path in it.
const builtFiles = fs.existsSync(distDir)
  ? fs
      .readdirSync(distDir, { recursive: true, encoding: "utf8" })
      .map((file) => file.split(path.sep).join("/"))
      .filter((file) => /\.(?:js|d\.ts)$/.test(file))
  : [];

test("has Vitest as an optional peer dependency of any version", () => {
  expect(manifest.peerDependencies.vitest).toBe("*");
  expect(manifest.peerDependenciesMeta.vitest).toEqual({ optional: true });
});

test("runs in Vitest 5.0.3 and later, and says so in an older one", () => {
  for (const version of ["5.0.3", "5.1.0", "5.0.10", "6.0.0-beta.1"]) {
    expect(() => assertVitestVersion(version), version).not.toThrow();
  }
  expect(() => assertVitestVersion("4.1.5")).toThrow(
    "vitest-plugin-rsc: runs in Vitest 5.0.3 or later, and this is Vitest 4.1.5.",
  );
  expect(() => assertVitestVersion("5.0.2")).toThrow("this is Vitest 5.0.2");
  expect(() => assertVitestVersion("5.0.0-beta.4")).toThrow("this is Vitest 5.0.0-beta.4");
});

describe.skipIf(builtFiles.length === 0)("the build", () => {
  test.for(builtFiles.filter((file) => !vitestFiles.includes(file)))(
    "%s does not import Vitest, nor a file that only Vitest loads",
    (file) => {
      const imports = importsOf(path.join(distDir, file));
      const ofVitest = imports.filter(
        (specifier) =>
          isVitest(specifier) ||
          vitestFiles.includes(path.posix.join(path.posix.dirname(file), specifier)),
      );
      expect(ofVitest).toEqual([]);
    },
  );

  test("has the files that only Vitest loads, which import it", () => {
    for (const file of vitestFiles) {
      expect(importsOf(path.join(distDir, file)).some(isVitest), file).toBe(true);
    }
  });

  test("reads what a file of types imports", () => {
    expect(importsOf(path.join(distDir, "nextjs/plugin.d.ts"))).toContain("vite");
  });
});
