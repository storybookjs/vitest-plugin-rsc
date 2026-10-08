import { commands } from "vitest/browser";
import { loadedCommand, type LoadedKind } from "./command.ts";

type Loaded = (kind: LoadedKind, id: string) => Promise<void>;
const loaded = (commands as unknown as Partial<Record<string, Loaded>>)[loadedCommand];

/**
 * The browser's side. Tells the plugin what the test file that runs now has
 * loaded without an import of its own: Vitest adds which test file that is.
 */
export function reportLoaded(kind: LoadedKind, id: string): void {
  void loaded?.(kind, id).catch(() => {});
}
