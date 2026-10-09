import { afterAll, afterEach, beforeEach } from "vitest";
import { commands } from "vitest/browser";
import { cleanup } from "./index.ts";
import { unloadClientFile } from "./client-graph.ts";
import { clientFileId } from "./client-ids.ts";
import { registry } from "./registry.ts";
import { stylesheetsCommand, type Stylesheets } from "./styles-command.ts";

// Registered by `vitestPluginNext()` as a setup file. Importing the entry
// first matters: it installs the server's platform before a test file can
// import a module of Next's server.
afterEach(cleanup);
// Also before a test: Vitest skips the remaining `afterEach` hooks when one
// of them throws, as a test's own does when it asserts in it.
beforeEach(cleanup);
// A test file with `"use client"` is done with what it imports: the pages of
// the files after it do not load that. Vitest reads the first parameter for
// the fixtures it names, so it has to be a pattern.
// oxlint-disable-next-line no-empty-pattern
afterAll(({}, { file }) => unloadClientFile(clientFileId(file.filepath)));

// The stylesheets of a route, from the plugin: see styles.ts. Vitest adds
// which test file asks, whose imports are the stylesheets of a node.
type LoadStylesheets = (entry: string, inline: boolean) => Promise<Stylesheets>;
const loadStylesheets = (commands as unknown as Partial<Record<string, LoadStylesheets>>)[
  stylesheetsCommand
];
registry.loadStylesheets = (entry, inline) => {
  if (!loadStylesheets) {
    throw new Error("vitest-plugin-rsc: the browser has no command for the stylesheets");
  }
  return loadStylesheets(entry, inline);
};
