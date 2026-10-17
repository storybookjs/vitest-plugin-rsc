import builtLayers from "virtual:vitest-plugin-rsc/layers";
import { registry } from "./registry.ts";
import { builtStylesheetsFile, type BuiltStylesheets } from "./styles-shared.ts";

// The stylesheets of a static build, which has them in a file of its own,
// `builtStylesheetsFile`: of every route, for Next (rsc.ts), and of every
// file of the host, also one with `"use client"` (client-graph.ts). The page
// fetches it once. Nothing with a dev server, which answers for them itself.

/** The URL of the directory of the build. Nothing with a dev server. */
export const buildDirectory: string | undefined =
  builtLayers && Object.values(builtLayers)[0]?.base;

let built: Promise<BuiltStylesheets> | undefined;

/** The stylesheets of the build. Only in a build, where `buildDirectory` is. */
export function builtStylesheets(): Promise<BuiltStylesheets> {
  if (!built) {
    built = load(new URL(builtStylesheetsFile, buildDirectory).href);
    // One that failed is asked again.
    built.catch(() => (built = undefined));
  }
  return built;
}

async function load(url: string): Promise<BuiltStylesheets> {
  // Its name does not change with its content, like `modules.json`: ask the
  // server whether the copy the browser has is still the one it serves.
  const response = await registry.network(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(
      `vitest-plugin-rsc: ${url} answered ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as BuiltStylesheets;
}
