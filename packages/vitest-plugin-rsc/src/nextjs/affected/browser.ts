import { commands } from "vitest/browser";
import { registry } from "../registry.ts";
import { loadedCommand, type LoadedKind } from "./command.ts";

type Loaded = (kind: LoadedKind, id: string) => Promise<void>;
const loaded = (commands as unknown as Partial<Record<string, Loaded>>)[loadedCommand];

// The browser's side: a setup file that `affectedTests()` adds, so the layers
// themselves do not import Vitest. Tells the plugin what the test file that
// runs now has loaded without an import of its own: Vitest adds which test
// file that is.
registry.reportLoaded = (kind, id) => {
  void loaded?.(kind, id).catch(() => {});
};
