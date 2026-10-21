// `node:stream/promises`: `pipeline()` and `finished()` of the package's
// stream, as promises. unenv's throw.

import { finished as finishedWith, pipeline as pipelineWith } from "vitest-plugin-rsc/node/stream";

export * from "unenv/node/stream/promises";

type Callback = (error?: Error | null) => void;
const isStream = (value: unknown): boolean =>
  !!value &&
  (typeof (value as any).pipe === "function" || typeof (value as any).write === "function");

export const pipeline = (...streams: unknown[]): Promise<void> => {
  // The options, with a signal: the request ends with the test here.
  if (!isStream(streams.at(-1))) streams.pop();
  return new Promise((resolve, reject) =>
    (pipelineWith as (...args: unknown[]) => unknown)(...streams, ((error) =>
      error ? reject(error) : resolve()) as Callback),
  );
};
export const finished = (target: unknown): Promise<void> =>
  new Promise((resolve, reject) =>
    (finishedWith as (target: unknown, callback: Callback) => unknown)(target, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
export default { pipeline, finished };
