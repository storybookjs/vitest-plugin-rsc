import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";

// The env of the run that a layer gets: the project's env files of Next's
// test mode, as the project's own `@next/env` parses and expands them, and
// `env` of `next.config`. Only what the files say: not a value that the
// host's process has from elsewhere, like the shell or env files that the
// host loaded, nor `.env.local`. A build reads no `.local` file at all: one
// holds a machine's secrets, and a build is a site.

/** Next's env files in its test mode. A name takes the value of the first file that has it. */
const testEnvFiles = [".env.test.local", ".env.test", ".env"];

/** The env files that a run or a build reads, by their path from the root. */
export function envFilesOf(build: boolean): string[] {
  return build ? testEnvFiles.filter((file) => !file.endsWith(".local")) : testEnvFiles;
}

// Next's own: the page's NODE_ENV stays as it is (docs/internals/next-routes.md,
// "Development Or Production"), and Next does not take the others in `env`
// of `next.config` either.
const isNextsOwn = (name: string) =>
  name === "NODE_ENV" || name === "NEXT_RUNTIME" || name.startsWith("__NEXT_");

export type TestEnv = {
  /** Each name of the files, with its value. */
  values: Record<string, string>;
  /** The files that were read, by their path from the root. */
  files: string[];
};

/**
 * The env files of a run or a build, parsed by the project's `@next/env` in
 * `envWorker`, a thread with `NODE_ENV=test` for all of its env: see
 * env-worker.ts.
 */
export async function readTestEnv(
  root: string,
  { nextEnv, envWorker, build }: { nextEnv: string; envWorker: string; build: boolean },
): Promise<TestEnv> {
  // As Next reads them: a file that is there, also a named pipe, in its order.
  const files = envFilesOf(build).flatMap((file) => {
    const stats = fs.statSync(path.join(root, file), { throwIfNoEntry: false });
    return stats?.isFile() || stats?.isFIFO()
      ? [{ path: file, contents: fs.readFileSync(path.join(root, file), "utf8"), env: {} }]
      : [];
  });
  if (files.length === 0) return { values: {}, files: [] };
  const worker = new Worker(envWorker, {
    env: { NODE_ENV: "test" },
    workerData: { nextEnv, root, files },
  });
  const parsed = await new Promise<Record<string, string>>((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => reject(new Error(`the thread exited with ${code}`)));
  });
  return {
    values: Object.fromEntries(Object.entries(parsed).filter(([name]) => !isNextsOwn(name))),
    files: files.map((file) => file.path),
  };
}

export type PageEnv = TestEnv & {
  /** The names that only `env` of `next.config` has. */
  configNames: string[];
};

/**
 * What the page's `process.env` gets: the test env, and `env` of
 * `next.config`, which Next's `getNextConfigEnv()` gives as defines.
 */
export function pageEnvOf(testEnv: TestEnv, configDefines: Record<string, unknown>): PageEnv {
  // The config is evaluated in the host, where `env: { X: process.env.X }`
  // may have a value of an env file that the host loaded, like `.env.local`.
  // So a name of the files has the files' value. A name that only the config
  // has is one that the app made public itself, as Next puts `env` in the
  // code of the browser.
  const configEnv = Object.fromEntries(
    Object.entries(configDefines).map(([key, value]) => [
      key.slice("process.env.".length),
      String(value),
    ]),
  );
  return {
    values: { ...configEnv, ...testEnv.values },
    files: testEnv.files,
    configNames: Object.keys(configEnv).filter((name) => !(name in testEnv.values)),
  };
}

/**
 * What a run or a build says of the env, once: the files it read, and in a
 * build the names it bundles. Never a value.
 */
export function describeEnv(env: PageEnv, build: boolean): string {
  const files =
    env.files.length > 0
      ? env.files.join(", ")
      : `no env file, as there is no ${envFilesOf(build).join(" or ")}`;
  if (!build) return `vitest-plugin-rsc: process.env of the app's server code is from ${files}`;
  const fileNames = Object.keys(env.values).filter((name) => !env.configNames.includes(name));
  return [
    `vitest-plugin-rsc: the build puts into the site the env of ${files}`,
    fileNames.length > 0 && `: ${fileNames.join(", ")}`,
    env.configNames.length > 0 && `; and env of next.config: ${env.configNames.join(", ")}`,
  ]
    .filter(Boolean)
    .join("");
}
