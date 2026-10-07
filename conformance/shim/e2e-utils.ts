// Stands in for `test/lib/e2e-utils`, which the tests of Next import as
// `e2e-utils`: `nextTestSetup()` and the mode a run is in.
import { afterAll, beforeAll } from "vitest";
import { mode, packages, prepared, root } from "virtual:next-conformance/config";
import { NextInstance, setCurrentNext } from "./next-instance.ts";

export type { NextInstance };
export type { Browser as Playwright } from "./browser.ts";

// The plugin runs the app the way `next build` and `next start` do: a
// production build of Next's runtime, no dev overlay, no HMR. So a run is in
// Next's `start` mode, unless the runner says otherwise.
export const isNextDev = mode === "dev";
export const isNextDeploy = false;
export const isNextStart = !isNextDev;
// Neither bundler built the app. The tests that ask mean a chunk name or the
// wording of a build error.
export const isTurbopack = false;
export const isRspack = false;
export const isReact18 = false;
export const itTurbopack = it.skip;

/** A file for `files` of `nextTestSetup()`, which Next copies into the app. */
export class FileRef {
  fsPath: string;

  constructor(fsPath: string) {
    this.fsPath = fsPath;
  }
}
export class PatchedFileRef extends FileRef {
  cb: (content: string) => string;

  constructor(fsPath: string, cb: (content: string) => string) {
    super(fsPath);
    this.cb = cb;
  }
}
export const patchFileWithDeployEnvAssignments = (path: string) =>
  new PatchedFileRef(path, (content) => content);

type Options = {
  files?: unknown;
  dependencies?: Record<string, string>;
  resolutions?: Record<string, string>;
  packageJson?: unknown;
  nextConfig?: unknown;
  overrideFiles?: unknown;
  env?: Record<string, string>;
  skipStart?: boolean;
  skipDeployment?: boolean;
  installCommand?: unknown;
  buildCommand?: unknown;
  buildArgs?: unknown;
  startCommand?: unknown;
  startArgs?: unknown;
  dir?: string;
  [option: string]: unknown;
};

const sameDirectory = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

// What Next does with these options that the runner did not do when it copied
// the fixture: the app the test asks for is not the app that runs.
function unavailable(options: Options): string | undefined {
  if (typeof options.files !== "string") {
    // A fixture can list its own directories one by one, to leave the test
    // file out of the app.
    const entries = Object.entries(options.files ?? {});
    const isFixture = entries.every(
      ([name, file]) => file instanceof FileRef && sameDirectory(file.fsPath, `${root}/${name}`),
    );
    if (entries.length === 0 || !isFixture) {
      return "nextTestSetup({ files }) builds the app out of files the test names, not the directory of the fixture";
    }
  } else if (!sameDirectory(options.files, root)) {
    return `nextTestSetup({ files }) names another directory than the one of the fixture: ${options.files}`;
  }
  const missing = Object.keys({ ...options.dependencies, ...options.resolutions }).filter(
    (name) => !packages.includes(name),
  );
  if (missing.length > 0)
    return `the fixture needs npm packages that are not installed: ${missing.join(", ")}`;
  // Not what the runner did before the run: see `prepared` in src/fixtures.ts.
  const isSet = (value: unknown) =>
    typeof value === "object" && value !== null ? Object.keys(value).length > 0 : Boolean(value);
  options = Object.fromEntries(
    Object.entries(options).filter(([option]) => !prepared.includes(option)),
  );
  for (const option of ["nextConfig", "overrideFiles", "packageJson"]) {
    if (isSet(options[option]))
      return `nextTestSetup({ ${option} }) changes the app before it is built`;
  }
  for (const option of [
    "installCommand",
    "buildCommand",
    "buildArgs",
    "startCommand",
    "startArgs",
  ]) {
    if (options[option]) return `nextTestSetup({ ${option} }) runs the Next.js CLI its own way`;
  }
}

export function nextTestSetup(options: Options) {
  const next = new NextInstance(unavailable(options));
  // The variables of the server's process. The server is in the tab.
  const previous = new Map<string, string | undefined>();
  beforeAll(() => {
    setCurrentNext(next);
    for (const [name, value] of Object.entries(options.env ?? {})) {
      previous.set(name, process.env[name]);
      process.env[name] = value;
    }
  });
  afterAll(async () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    setCurrentNext(undefined);
    await next.destroy();
  });
  return { next, isNextDev, isNextDeploy, isNextStart, isTurbopack, isRspack, skipped: false };
}
