import "server-only";
import { report } from "host-report";
import { version } from "react";

// A file of the host without "use client", which the page imports, and so
// does a file of the host with the directive, client-shared.tsx: server code,
// evaluated once, in the rsc layer. The file with the directive gets the
// page's instance of it, with its state, and `server-only`, which throws in
// the browser layer, is the rsc layer's.
report({ from: "host/shared.ts", react: version });

/** Who visited, by the file that did: the page and the file with the directive. */
export const visits = new Map<string, number>();

export function visit(from: string): void {
  visits.set(from, (visits.get(from) ?? 0) + 1);
}
