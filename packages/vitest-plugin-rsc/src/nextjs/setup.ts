import { afterEach, beforeEach } from "vitest";
import { commands } from "vitest/browser";
import { cleanup } from "./index.ts";
import { unlinkClientStylesheets } from "./client-graph.ts";
import { registry } from "./registry.ts";
import { stylesheetsCommand, type Stylesheets } from "./styles-command.ts";
// Vitest's side of watch mode: see the file.
import "./affected/browser.ts";

// Registered by `vitestPluginNext()` as a setup file. Importing the entry
// first matters: it installs the server's platform before a test file can
// import a module of Next's server.
//
// What the layers need of Vitest is set up here, and only here: a static
// build runs them in a page without Vitest.

// The stylesheets of a route are the plugin's to say, as they are a build's:
// see styles.ts. Vitest adds which test file asks, for the route of a node.
registry.loadStylesheets = (entry, inline) => {
  const load = (
    commands as unknown as Partial<
      Record<string, (entry: string, inline: boolean) => Promise<Stylesheets>>
    >
  )[stylesheetsCommand];
  if (!load) throw new Error("vitest-plugin-rsc: the browser has no command for the stylesheets");
  return load(entry, inline);
};

// Vitest evaluates a setup file again before every test file, also one whose
// tests are all skipped. So the CSS that a test file with `"use client"`
// linked goes once the next file starts.
unlinkClientStylesheets();

afterEach(cleanup);
// Also before a test: Vitest skips the remaining `afterEach` hooks when one
// of them throws, as a test's own does when it asserts in it.
beforeEach(cleanup);
