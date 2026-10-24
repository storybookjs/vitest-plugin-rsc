import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";
//#region src/nextjs/project/env-worker.ts
const { nextEnv, root, files } = workerData;
const { processEnv } = createRequire(import.meta.url)(nextEnv);
const [, parsed = {}] = processEnv(files, root, console, true);
parentPort.postMessage(parsed);
//#endregion
export {};
