// Next's renderer is bundler-agnostic, apart from the Flight codec it imports
// as `react-server-dom-webpack`. In the rsc layer that codec is Vite RSC's,
// through the adapters in rsc.ts, and these are the exports they have.
export const rscFlightCodec = {
  server: [
    "renderToReadableStream",
    "decodeReply",
    "decodeReplyFromAsyncIterable",
    "decodeAction",
    "decodeFormState",
    "createTemporaryReferenceSet",
    "registerServerReference",
    "registerClientReference",
    "createClientModuleProxy",
  ],
  static: ["prerender"],
  client: ["createFromReadableStream", "encodeReply", "createTemporaryReferenceSet"],
} as const;

export type FlightEntry = keyof typeof rscFlightCodec;

/** The adapters of one entry: a function for each of its exports. */
export type FlightAdapters<Entry extends FlightEntry> = Record<
  (typeof rscFlightCodec)[Entry][number],
  (...args: any[]) => unknown
>;

const owners: Record<FlightEntry, string> = {
  server: "flightServer",
  static: "flightStatic",
  client: "flightClient",
};

/**
 * The module that the rsc layer gets for an entry of Next's codec. It has
 * every export of the entry, as the installed `next` has it, and forwards it
 * to the adapter that rsc.ts puts in `registry`. The lookup is deferred to
 * the call, so a pre-bundled chunk can load before rsc.ts has. An export
 * without an adapter throws when it is called.
 */
export function flightBridge(
  entry: FlightEntry,
  exports: string[],
  nextVersion: string,
  registry: string,
): string {
  const adapted: readonly string[] = rscFlightCodec[entry];
  return exports
    .map((name) => {
      if (adapted.includes(name)) {
        return `export const ${name} = (...args) => ${registry}.${owners[entry]}.${name}(...args);`;
      }
      const message =
        `vitest-plugin-rsc: \`${name}\` of Next's Flight codec is not supported ` +
        `in the rsc layer (next@${nextVersion}).`;
      return `export const ${name} = () => { throw new Error(${JSON.stringify(message)}); };`;
    })
    .join("\n");
}
