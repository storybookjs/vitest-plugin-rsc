import builtLayers from "virtual:vitest-plugin-rsc/layers";
import { registry } from "./registry.ts";
import { builtFilesPath, type BuiltFiles } from "./styles-shared.ts";

// The files a page of a static build loads besides the layers, which the
// build lists in a file of its own, `builtFilesPath`: the stylesheets and the
// modules of every route, for Next and for the page load (rsc.ts), and the
// stylesheets of every file of the host, also one with `"use client"`
// (client-graph.ts). The page fetches it once. Nothing with a dev server,
// which answers for them itself.

/** The URL of the directory of the build. Nothing with a dev server. */
export const buildDirectory: string | undefined =
  builtLayers && Object.values(builtLayers)[0]?.base;

let built: Promise<BuiltFiles> | undefined;

/** The files of the build. Only in a build, where `buildDirectory` is. */
export function builtFiles(): Promise<BuiltFiles> {
  if (!built) {
    built = load(new URL(builtFilesPath, buildDirectory).href);
    // One that failed is asked again.
    built.catch(() => (built = undefined));
  }
  return built;
}

async function load(url: string): Promise<BuiltFiles> {
  // Its name does not change with its content, like `modules.json`: ask the
  // server whether the copy the browser has is still the one it serves.
  const response = await registry.network(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(
      `vitest-plugin-rsc: ${url} answered ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as BuiltFiles;
}
