import { expect, test } from "vitest";
import { candidatesOf, createPathsPlugin } from "./paths.ts";
import type { NextProject } from "./project.ts";

const paths = (patterns: Record<string, string[]>, explicitBaseUrl = false) => ({
  baseUrl: "/app",
  explicitBaseUrl,
  patterns,
});

test("puts the part a pattern leaves open into its targets, in order", () => {
  expect(candidatesOf(paths({ "@/*": ["./src/*", "./lib/*"] }), "@/notes/db")).toEqual([
    "/app/src/notes/db",
    "/app/lib/notes/db",
  ]);
});

test("takes the pattern with the longest prefix, as TypeScript does", () => {
  const patterns = { "@/*": ["./*"], "@/ui/*": ["./components/ui/*"] };

  expect(candidatesOf(paths(patterns), "@/ui/button")).toEqual(["/app/components/ui/button"]);
  expect(candidatesOf(paths(patterns), "@/lib/db")).toEqual(["/app/lib/db"]);
});

test("matches a pattern without a star only as it is", () => {
  const patterns = { db: ["./lib/db.ts"] };

  expect(candidatesOf(paths(patterns), "db")).toEqual(["/app/lib/db.ts"]);
  expect(candidatesOf(paths(patterns), "db/schema")).toEqual([]);
});

test("leaves out a pattern with more than one star, and a declaration file, as Next does", () => {
  const patterns = { "@/*/x/*": ["./src/*"], "types/*": ["./types/*.d.ts", "./lib/*"] };

  expect(candidatesOf(paths(patterns), "@/a/x/b")).toEqual([]);
  expect(candidatesOf(paths(patterns), "types/note")).toEqual(["/app/lib/note"]);
});

// The plugin with a resolver that knows `files`.
const resolveWith = (project: ReturnType<typeof paths>, files: string[]) => {
  const plugin = createPathsPlugin(() => ({ paths: project }) as NextProject);
  const context = { resolve: async (id: string) => (files.includes(id) ? { id } : null) };
  const resolveId = plugin.resolveId as (
    this: typeof context,
    source: string,
    importer: string,
    options: object,
  ) => Promise<{ id: string } | null | undefined>;
  return (source: string) => resolveId.call(context, source, "/app/page.js", {});
};

test("looks for a bare import in a baseUrl that the config sets, after the packages", async () => {
  const files = ["/app/components/button", "/app/lib", "lib"];

  const explicit = resolveWith(paths({}, true), files);
  expect(await explicit("components/button")).toEqual({ id: "/app/components/button" });
  // A package wins from a directory with its name.
  expect(await explicit("lib")).toEqual({ id: "lib" });
  // Not in a baseUrl that TypeScript made up for the paths.
  expect(await resolveWith(paths({}), files)("components/button")).toBeUndefined();
});
