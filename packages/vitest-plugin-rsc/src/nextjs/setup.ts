import { afterEach, beforeEach } from "vitest";
import { commands } from "vitest/browser";
import { cleanup } from "./index.ts";
import { unlinkClientStylesheets } from "./client-graph.ts";
import { registry } from "./registry.ts";
import { stylesheetsCommand, type Stylesheets } from "./styles-command.ts";

// Registered by `vitestPluginNext()` as a setup file. With affected/browser.ts
// the only module of the layers that imports Vitest, which another host, or a
// static build, runs without. Importing the entry first matters: it installs
// the server's platform before a test file can import a module of Next's
// server.

// Vitest evaluates a setup file again before every test file, also one whose
// tests are all skipped. So the CSS that a test file with `"use client"`
// linked goes once the next file starts.
unlinkClientStylesheets();

afterEach(cleanup);
// Also before a test: Vitest skips the remaining `afterEach` hooks when one
// of them throws, as a test's own does when it asserts in it.
beforeEach(cleanup);

// The stylesheets of a route, from a command of Vitest's: see styles.ts. It
// knows which test file asks, whose imports are the stylesheets of a node.
// Another host asks the dev server (rsc.ts).
type LoadStylesheets = (entry: string, inline: boolean) => Promise<Stylesheets>;
const loadStylesheets = (commands as unknown as Partial<Record<string, LoadStylesheets>>)[
  stylesheetsCommand
];
if (!loadStylesheets) {
  throw new Error("vitest-plugin-rsc: the browser has no command for the stylesheets");
}
registry.loadStylesheetsOfTestFile = loadStylesheets;
