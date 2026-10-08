import { expect, test } from "vitest";
import { candidatesOf } from "./paths.ts";

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

test("looks for a bare import in a baseUrl that the config sets, after the paths", () => {
  expect(candidatesOf(paths({ "@/*": ["./src/*"] }, true), "@/db")).toEqual([
    "/app/src/db",
    "/app/@/db",
  ]);
  expect(candidatesOf(paths({}, true), "components/button")).toEqual(["/app/components/button"]);
  expect(candidatesOf(paths({}), "components/button")).toEqual([]);
});
