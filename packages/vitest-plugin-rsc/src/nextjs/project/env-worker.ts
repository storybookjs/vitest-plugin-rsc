import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

// The thread in which the project's own `@next/env` parses the env files of
// a run (env.ts). Next's loader expands a `$VAR` against the process first,
// and writes each name it parses into the process. Here the process has
// `NODE_ENV=test` and nothing else: it reads no value of the host, and
// writes none.

type EnvFile = { path: string; contents: string; env: Record<string, string> };

const { nextEnv, root, files } = workerData as { nextEnv: string; root: string; files: EnvFile[] };
const { processEnv } = createRequire(import.meta.url)(nextEnv) as {
  processEnv(
    files: EnvFile[],
    dir: string,
    log: Console,
    forceReload: boolean,
  ): [Record<string, string>, Record<string, string>?];
};
// The names the files add to the process, each with the value of the first
// file that has it.
const [, parsed = {}] = processEnv(files, root, console, true);
parentPort!.postMessage(parsed);
