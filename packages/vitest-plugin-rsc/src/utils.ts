import {
  createDefaultImportMeta,
  ModuleRunner,
  ssrDynamicImportKey,
  ssrExportAllKey,
  ssrExportNameKey,
  ssrImportKey,
  ssrImportMetaKey,
  ssrModuleExportsKey,
  type ModuleEvaluator,
  type ModuleRunnerImportMeta,
  type ModuleRunnerTransport,
} from "vite/module-runner";
import hostModules from "virtual:vitest-plugin-rsc/host-modules";
import builtLayers from "virtual:vitest-plugin-rsc/layers";
import * as pageClient from "virtual:vitest-plugin-rsc/vite-client";
import {
  builtUrl,
  createBuiltLayers,
  type InvokePayload,
  type InvokeResult,
} from "./built-layers.ts";
import { isHostModule } from "./host-module.ts";
import { runnerTimers, timersKey } from "./timers.ts";
import {
  answerEvent,
  changedEvent,
  invokeEvent,
  versionEvent,
  webSocketInfoPath,
  webSocketQuery,
  type ChangedQuestion,
  type PageAnswer,
} from "./websocket-bridge.ts";

// The page's own instance of Vite's client, for the modules that the runners
// below evaluate: see vite-client.ts.
(globalThis as { __vitest_plugin_rsc_vite_client__?: unknown }).__vitest_plugin_rsc_vite_client__ =
  pageClient;

const reactClientCoverageModulePath = "/@vite/react-client-coverage-module";
const reactClientCoverageQuery = "vitest-plugin-rsc-react-client-coverage";
const sourceUrlRE = /\/\/# sourceURL=[^\n\r]*/;
const sourceUrlLineRE = /^\/\/# sourceURL=/m;

/** What the server says of a module next to it: see `describeModule()` in index.ts. */
type ModuleAnswer = InvokeResult & { imports?: string[]; dependency?: boolean };
type ViteFetchResult = {
  code: string;
  file: string;
  id?: string;
  url?: string;
  invalidate?: boolean;
};

type WebSocketInfo = { token: string; path: string };
type PendingInvoke = {
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout> | undefined;
};
type InvokeResultMessage = {
  type?: string;
  event?: string;
  data?: {
    id?: string;
    result?: unknown;
  };
};

// Before anything replaces it: this request is for the dev server, or for a
// file of a static build.
const nativeFetch = globalThis.fetch;

/**
 * Asks the dev server what a plugin answers at `event`, over the websocket of
 * the page: see `answerPage()` in websocket-bridge.ts.
 */
export async function askDevServer<T>(event: string, question: object): Promise<T> {
  // Without a timeout, as a request of HTTP: one question can take a while,
  // like the first walk of a route, which compiles all of it.
  const result = (await requestOverWebSocket(event, question, false)) as PageAnswer<T>;
  if ("error" in result) {
    throw new Error(`vitest-plugin-rsc: the dev server failed to answer ${event}: ${result.error}`);
  }
  return result.answer;
}

// The modules of a static build, see built-layers.ts: the browser layer's
// at once, which every page runs, and those of another layer when a runner
// of it asks.
const built = createBuiltLayers(
  nativeFetch,
  Object.values(builtLayers ?? {}).filter((layer) => layer !== undefined),
);

let webSocket: WebSocket | undefined;
let webSocketPromise: Promise<WebSocket> | undefined;
let webSocketInfoPromise: Promise<WebSocketInfo> | undefined;
let nextInvokeId = 0;
const invokeTimeout = 30_000;
// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
const now = performance.now.bind(performance);
// When the server last answered. A page asks for its modules at once, and a
// dev server that compiles them for the first time answers them one by one:
// a request waits for the ones before it, so it times out when the server has
// been silent, not when it is old.
let lastAnswer = 0;

const pendingInvokes = new Map<string, PendingInvoke>();

const runners = new Map<string, ModuleRunner>();

// One module runner per Vite environment that runs in the page next to the
// browser tests. All of them share this websocket.
function getRunner(environment: string): ModuleRunner {
  let runner = runners.get(environment);
  if (!runner) {
    const invoke = (payload: InvokePayload) => invokeEnvironment(environment, payload);
    runners.set(environment, (runner = createRunner(environment, invoke)));
  }
  return runner;
}

// What `import.meta` of a module says of its file, once per file of an
// environment: Vite's runner would normalize the path and parse the URL for
// every module of every page load. Each module gets a copy of its own.
const importMetas = new Map<string, ModuleRunnerImportMeta>();

function importMetaOf(environment: string, file: string): ModuleRunnerImportMeta {
  const key = `${environment}\n${file}`;
  let meta = importMetas.get(key);
  if (!meta) {
    const layer = builtLayers?.[environment];
    meta = createDefaultImportMeta(file);
    // A module of a build has the URL of the file it would be, from which it
    // names the files of the build, like its CSS.
    if (layer) meta.url = builtUrl(layer, file);
    importMetas.set(key, meta);
  }
  return meta;
}

// A runner of an environment. A module of the page is the page's own, and a
// static build has the modules of the environment in a file of its own.
function createRunner(
  environment: string,
  invoke: NonNullable<ModuleRunnerTransport["invoke"]>,
  { sourcemaps = false } = {},
): ModuleRunner {
  const layer = builtLayers?.[environment];
  // A runner that is closed, like a page's that was left, settles none of
  // the `import()`s of its modules, and fires none of their timers.
  const isClosed = () => runner.isClosed();
  const timers = runnerTimers(isClosed);
  const runner = new ModuleRunner(
    {
      // With `sourcemaps`, the stack of an error has the lines of the source
      // for a module of this runner, where it has the lines of what the
      // runner evaluates. For that every stack is formatted as Vite does it.
      // A build has no source maps.
      sourcemapInterceptor: sourcemaps && !layer ? "prepareStackTrace" : false,
      transport: {
        invoke: async (payload) =>
          hostModule(payload) ?? (layer ? built.invoke(layer, payload) : invoke(payload)),
      },
      hmr: false,
      // The timers its code calls: see timers.ts.
      createImportMeta: (file) => ({ ...importMetaOf(environment, file), [timersKey]: timers }),
    },
    droppingImportsOnceClosed(isClosed),
  );
  return runner;
}

/**
 * A module runner with a module graph of its own: every module it imports is
 * evaluated again, the way a page load evaluates a page's scripts again. Call
 * `checkFetchedModules()` before every page load, and before a runner that is
 * made between two, or a file that changed goes unnoticed.
 */
export function createEnvironmentRunner(
  environment: string,
  { sourcemaps = false } = {},
): ModuleRunner {
  let first: FetchedModules | undefined;
  const invoke = async (payload: InvokePayload) => {
    const modules = await fetchedModules(environment);
    first ??= modules;
    // A runner that has modules of before a file changed asks the server
    // itself, which says of each whether the runner has to evaluate it again.
    return modules === first
      ? invokeForPageLoad(environment, payload, modules)
      : invokeEnvironment(environment, payload);
  };
  const runner = createRunner(environment, invoke, { sourcemaps });
  // The modules of a build do not change.
  if (builtLayers?.[environment]) return runner;
  takes.set(runner, async () => {
    const modules = await fetchedModules(environment);
    const since = first?.version;
    if (since !== undefined && since !== modules.version) {
      const question: ChangedQuestion = { environment, since };
      const changed = await askDevServer<string[]>(changedEvent, question);
      first = modules;
      return changed;
    }
    first = modules;
    return [];
  });
  return runner;
}

const takes = new WeakMap<ModuleRunner, () => Promise<string[]>>();

/**
 * For a runner of `createEnvironmentRunner()` that outlives a page load: it
 * takes the modules that the tab has fetched now, as the runner of the next
 * page load does, where it would ask the server for each one from then on.
 * Call `checkFetchedModules()` first, and one at a time. Resolves with the
 * ids of the modules that Vite invalidated since the version that the runner
 * had: for a change of a file, its modules and the ones that import them.
 * The runner keeps what it evaluated, also a module that changed: invalidate
 * those.
 */
export function takeChangedModules(runner: ModuleRunner): Promise<string[]> {
  return takes.get(runner)?.() ?? Promise.resolve([]);
}

// A module of the page is not the environment's to serve: the runner imports
// it as the page does. See host-module.ts.
function hostModule(payload: InvokePayload): InvokeResult | undefined {
  const { name, data } = (payload as { data: { name: string; data: unknown[] } }).data;
  if (name !== "fetchModule" || !isHostModule(String(data[0]))) return;
  return { result: { externalize: data[0], type: "module" } } as InvokeResult;
}

/**
 * What a runner imports a module of an environment by: its id, or in a build
 * the id of the module that it is the entry of.
 */
export function environmentModule(environment: string, id: string): string {
  const entry = builtLayers?.[environment]?.entries[id];
  return entry ? `/${entry}` : id;
}

export function importReactClient<T = any>(id: string): Promise<T> {
  return getRunner("react_client").import<T>(environmentModule("react_client", id));
}

async function invokeEnvironment(environment: string, payload: InvokePayload) {
  const result = await invokeOverWebSocket(environment, payload);
  // Coverage is collected for the modules the browser itself runs.
  return environment === "react_client" ? await withReactClientCoverage(result) : result;
}

// What a browser's HTTP cache is to a page load: a module graph that is
// evaluated again (see createEnvironmentRunner) does not have to ask the dev
// server for a module again. Vite's module runner asks for every import of
// every module, also for a module it already has, which is hundreds of
// requests for one page. They are answered here, for as long as the server
// says that its modules are the ones that were fetched: see `versionOf()`
// in index.ts.
type FetchedModules = { version: number; results: Map<string, Promise<InvokeResult>> };

const fetchedModulesOf = new Map<string, Promise<FetchedModules>>();

function fetchedModules(environment: string): Promise<FetchedModules> {
  return fetchedModulesOf.get(environment) ?? askForModules(environment);
}

/**
 * The version of the modules of `environment` that the dev server has: when
 * Vite last invalidated one of them, see `versionOf()` in module-versions.ts.
 */
export function versionOfModules(environment: string): Promise<number> {
  return requestOverWebSocket(versionEvent, { environment }) as Promise<number>;
}

// The modules that were fetched, when the server still has that version of
// its modules.
function askForModules(environment: string, known?: FetchedModules): Promise<FetchedModules> {
  const fetched = versionOfModules(environment).then(
    (version): FetchedModules =>
      known && known.version === version ? known : { version, results: new Map() },
  );
  fetchedModulesOf.set(environment, fetched);
  // Not kept: the next module asks again. Modules that were fetched stay, and
  // the next page load asks: a runner of the server layer that got others
  // would ask the server itself from then on.
  fetched.catch(() => {
    if (fetchedModulesOf.get(environment) !== fetched) return;
    if (known) fetchedModulesOf.set(environment, Promise.resolve(known));
    else fetchedModulesOf.delete(environment);
  });
  return fetched;
}

/**
 * The environments that the page keeps answers of the dev server about,
 * besides those of the runners that fetched modules: the document's own,
 * Vite's `client`, and the browser layer's, whose modules the stylesheets of
 * a route are read off with it. None for a static build, which has no dev
 * server, and whose modules do not change.
 */
export const answeredEnvironments = builtLayers ? [] : ["client", "react_client"];
// The versions of the modules of those, and of the runners' environments, as
// the page last checked them: see `checkedVersions()`.
let checked: Promise<string> | undefined;

/**
 * Asks the server whether the modules that were fetched are still its modules,
 * for the runners of `createEnvironmentRunner()`, and for the answers about
 * its modules that the page keeps: see `checkedVersions()`. Before a page
 * load: a file can change while the tests run.
 */
export function checkFetchedModules(): Promise<void> {
  const fetched = new Map(
    Array.from(fetchedModulesOf, ([environment, modules]) => [
      environment,
      modules
        .catch(() => undefined)
        .then((known) => askForModules(environment, known))
        .then(({ version }) => version),
    ]),
  );
  const environments = [...new Set([...answeredEnvironments, ...fetched.keys()])].sort();
  const versions = Promise.all(
    environments.map(
      async (environment) =>
        `${environment}:${await (fetched.get(environment) ?? versionOfModules(environment))}`,
    ),
  ).then((all) => all.join(" "));
  checked = versions;
  // A check that failed is no version: the next asks again.
  versions.catch(() => {
    if (checked === versions) checked = undefined;
  });
  return versions.then(() => {});
}

/**
 * The versions of the dev server's modules as the page last checked them,
 * before its latest page load (`checkFetchedModules()`), or now when it has
 * not: what the page keeps of an answer about them, like the stylesheets of a
 * route, holds for as long as this stays. A change of a file invalidates its
 * modules, on a server with a watcher of its own and on one whose host's
 * watcher does it, a project's under Vitest.
 */
export function checkedVersions(): Promise<string> {
  if (!checked) void checkFetchedModules().catch(() => {});
  return checked!;
}

type FetchModulePayload = { data: { name: string; data: [string?, string?, FetchOptions?] } };
type FetchOptions = { cached?: boolean; startOffset?: number };

// The server resolves a path by itself, and anything else from its importer.
const fetchKey = (name: string, url?: string, importer?: string) =>
  [name, url, url && /^[./]/.test(url) ? undefined : importer].join("\n");

async function invokeForPageLoad(
  environment: string,
  payload: InvokePayload,
  modules: FetchedModules,
): Promise<InvokeResult> {
  // An invoke of the runner: `fetchModule` with a URL, its importer and
  // whether the runner has the module, or `getBuiltins`.
  const { name, data } = (payload as FetchModulePayload).data;
  if (name !== "fetchModule" && name !== "getBuiltins") {
    return invokeEnvironment(environment, payload);
  }
  const [url, importer, options] = data;
  const result = await fetchOnce(environment, payload, modules, fetchKey(name, url, importer));
  if (!isInvokeSuccess(result)) return result;
  // The answer to a runner that has the module, which this one may not.
  if (isCachedResult(result.result) && !options?.cached) {
    return invokeEnvironment(environment, payload);
  }
  // As the server answers for a module that the runner says it has.
  return options?.cached && isViteFetchResult(result.result) ? { result: { cache: true } } : result;
}

// Vite's module runner asks for the imports of a module one after the other,
// each once the one before it has run: a round trip to the server for every
// module of a page, in a row. The server says what a module imports (see
// `describeModule()` in index.ts), so those are asked for right away, all at
// once, and theirs when they arrive.
function fetchOnce(
  environment: string,
  payload: InvokePayload,
  modules: FetchedModules,
  key: string,
): Promise<InvokeResult> {
  let fetching = modules.results.get(key);
  if (fetching) return fetching;
  const forget = () => {
    if (modules.results.get(key) === fetching) modules.results.delete(key);
  };
  fetching = invokeEnvironment(environment, payload).then((result) => {
    // Not what the runner already has, or an error: that is an answer to
    // this one request.
    if (!isInvokeSuccess(result) || isCachedResult(result.result)) {
      forget();
      return result;
    }
    const fetched = result.result;
    if (!isViteFetchResult(fetched)) return result;
    // A runner evaluates a module it has again when the server says that it
    // compiled the module anew. This answer is for every runner that asks,
    // and for every URL of the module: a page would run the module twice.
    // These runners have no module of before a file changed, see
    // `createEnvironmentRunner()`.
    fetched.invalidate = false;
    const { name, data } = (payload as FetchModulePayload).data;
    // A runner knows a module by the URL the server has for it, also when it
    // asked for another one, like `/app/page.tsx?import`.
    const known = fetched.url && fetchKey(name, fetched.url);
    if (known && !modules.results.has(known)) modules.results.set(known, fetching!);
    const { startOffset } = data[2] ?? {};
    // As the runner asks for an import of the module.
    const importer = fetched.file || fetched.id;
    for (const imported of (result as ModuleAnswer).imports ?? []) {
      // The page's own: the runner does not ask the server for it.
      if (isHostModule(imported)) continue;
      const args = [imported, importer, { cached: false, startOffset }];
      const ahead = { ...payload, data: { ...(payload as FetchModulePayload).data, data: args } };
      // A runner that asks for it gets the error.
      fetchOnce(
        environment,
        ahead as InvokePayload,
        modules,
        fetchKey(name, imported, importer),
      ).catch(() => {});
    }
    return result;
  });
  modules.results.set(key, fetching);
  fetching.catch(forget);
  return fetching;
}

function isCachedResult(value: unknown): boolean {
  return typeof value === "object" && value !== null && "cache" in value;
}

const AsyncFunction = async function () {}.constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;
const contextKeys = [
  ssrModuleExportsKey,
  ssrImportMetaKey,
  ssrImportKey,
  ssrDynamicImportKey,
  ssrExportAllKey,
  ssrExportNameKey,
] as const;
const strict = '"use strict";';

// Runs a module as Vite's own evaluator does, and compiles it once: a page
// load gets its modules from what the tab has fetched, and a module that was
// fetched once is the same code for every page. What a module is, its exports
// and its state, is in what it is called with, so every page still gets its
// own. The code follows `"use strict";` on its line, as in coverage.ts.
const compiledModules = new WeakMap<object, (...args: unknown[]) => Promise<unknown>>();

const pageLoadEvaluator: ModuleEvaluator = {
  // The lines of the function before the code of the module.
  startOffset: (() => {
    const source = String(new AsyncFunction("a", "b", `${strict}/*code*/`));
    return source.slice(0, source.indexOf("/*code*/")).split("\n").length - 1;
  })(),
  async runInlinedModule(context, code, module) {
    // The answer of the server, which the pages share.
    const fetched = module.meta as { code?: string } | undefined;
    const shared = fetched?.code === code ? fetched : undefined;
    let run = shared && compiledModules.get(shared);
    if (!run) {
      // The server names a module in its source map, and a dependency comes
      // without one: see `dependencySourceMapPlugin()` in index.ts.
      // On a line of its own: React and Next have it in a string.
      if (!sourceUrlLineRE.test(code)) code += `\n//# sourceURL=${module.id}`;
      run = new AsyncFunction(...contextKeys, strict + code);
      if (shared) compiledModules.set(shared, run);
    }
    await run(...contextKeys.map((key) => context[key]));
    Object.seal(context[ssrModuleExportsKey]);
  },
  async runExternalModule(file) {
    if (!isHostModule(file)) return import(/* @vite-ignore */ file);
    // What the page serves for a module of its own has that module as its
    // default export: see host-module.ts. A static build has it in the
    // host's build, which the list imports it from.
    const load = hostModules ? hostModules[file] : () => import(/* @vite-ignore */ file);
    if (!load) throw new Error(`vitest-plugin-rsc: the build has no module of the page ${file}`);
    return ((await load()) as { default?: unknown }).default;
  },
};

// A runner that is closed, like the one of a page that has been left, settles
// no more `import()` of its modules, as a browser drops what a page loads once
// the page has gone: also one that it started before, and one that fails
// because the runner is closed.
function droppingImportsOnceClosed(isClosed: () => boolean): ModuleEvaluator {
  const dropped = () => new Promise<never>(() => {});
  return {
    ...pageLoadEvaluator,
    runInlinedModule(context, code, module) {
      const load = context[ssrDynamicImportKey];
      return pageLoadEvaluator.runInlinedModule(
        {
          ...context,
          [ssrDynamicImportKey]: (...args) =>
            load(...args).then(
              (loaded) => (isClosed() ? dropped() : loaded),
              (error: unknown) => {
                if (isClosed()) return dropped();
                throw error;
              },
            ),
        },
        code,
        module,
      );
    },
  };
}

async function withReactClientCoverage(result: InvokeResult) {
  if (
    !isCoverageEnabled() ||
    !isInvokeSuccess(result) ||
    !isViteFetchResult(result.result) ||
    (result as ModuleAnswer).dependency ||
    isNodeModuleFile(result.result.file)
  ) {
    return result;
  }

  // Vitest's V8 coverage runs in the Browser Mode worker, while client
  // components are evaluated by this separate react_client ModuleRunner.
  const sourceUrl = toBrowserCoverageFileUrl(result.result.file);
  const code = withBrowserSourceUrl(result.result.code, sourceUrl);

  await recordEvaluatedModule(result.result.file, code);

  return {
    ...result,
    result: {
      ...result.result,
      code,
    },
  };
}

function isInvokeSuccess(result: InvokeResult): result is { result: unknown } {
  return typeof result === "object" && result !== null && "result" in result;
}

function isCoverageEnabled() {
  const worker = globalThis as typeof globalThis & {
    __vitest_worker__?: { config?: { coverage?: { enabled?: boolean } } };
  };

  return Boolean(worker.__vitest_worker__?.config?.coverage?.enabled);
}

function isViteFetchResult(value: unknown): value is ViteFetchResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "file" in value &&
    typeof value.code === "string" &&
    typeof value.file === "string"
  );
}

function isNodeModuleFile(file: string) {
  return file.replace(/\\/g, "/").includes("/node_modules/");
}

function withBrowserSourceUrl(code: string, sourceUrl: string) {
  const sourceUrlComment = `//# sourceURL=${sourceUrl}`;
  return sourceUrlRE.test(code)
    ? code.replace(sourceUrlRE, sourceUrlComment)
    : `${code}\n${sourceUrlComment}`;
}

async function recordEvaluatedModule(file: string, code: string) {
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", reactClientCoverageModulePath);
    request.setRequestHeader("content-type", "application/json");
    request.addEventListener("load", () => resolve());
    request.addEventListener("error", () =>
      reject(new Error("Failed to record React client coverage module")),
    );
    request.send(JSON.stringify({ file, code }));
  });
}

function toBrowserCoverageFileUrl(file: string) {
  const path = file.replace(/\\/g, "/");
  const encodedPath = encodeURI(path).replace(/\?/g, "%3F").replace(/#/g, "%23");
  const url = new URL(
    `/@fs${encodedPath.startsWith("/") ? "" : "/"}${encodedPath}`,
    window.location.origin,
  );
  url.searchParams.set(reactClientCoverageQuery, "1");
  return url.href;
}

function invokeOverWebSocket(environment: string, payload: InvokePayload) {
  return requestOverWebSocket(invokeEvent, {
    environment,
    payload,
  }) as Promise<InvokeResult>;
}

// Rejects once the server has sent nothing for `invokeTimeout`, unless the
// request does not `expire`.
async function requestOverWebSocket(event: string, data: object, expires = true): Promise<unknown> {
  const socket = await getReactClientWebSocket();
  const id = String(++nextInvokeId);

  return new Promise((resolve, reject) => {
    const sent = now();
    const pending: PendingInvoke = {
      resolve,
      reject,
      timeoutId: expires ? setTimeout(expire, invokeTimeout) : undefined,
    };
    function expire() {
      const silent = now() - Math.max(sent, lastAnswer);
      if (silent < invokeTimeout) {
        pending.timeoutId = setTimeout(expire, invokeTimeout - silent);
        return;
      }
      pendingInvokes.delete(id);
      reject(new Error(`React client websocket invoke timed out: ${event} ${id}`));
    }

    pendingInvokes.set(id, pending);
    try {
      socket.send(JSON.stringify({ type: "custom", event, data: { id, ...data } }));
    } catch (error) {
      clearTimeout(pending.timeoutId);
      pendingInvokes.delete(id);
      reject(error);
    }
  });
}

async function getReactClientWebSocket() {
  if (webSocket?.readyState === WebSocket.OPEN) {
    return webSocket;
  }

  webSocketPromise ??= openReactClientWebSocket().finally(() => {
    webSocketPromise = undefined;
  });
  return webSocketPromise;
}

async function openReactClientWebSocket() {
  const info = await getWebSocketInfo();
  const socket = new WebSocket(createWebSocketUrl(info), "vite-hmr");

  socket.addEventListener("message", handleWebSocketMessage);
  socket.addEventListener("close", () => {
    if (webSocket === socket) {
      webSocket = undefined;
    }
    rejectPendingInvokes(new Error("React client websocket connection closed"));
  });

  await waitForWebSocketOpen(socket);
  webSocket = socket;
  return socket;
}

function waitForWebSocketOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);
    };
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("React client websocket connection failed"));
    };
    const handleClose = () => {
      cleanup();
      reject(new Error("React client websocket closed before opening"));
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("error", handleError);
    socket.addEventListener("close", handleClose);
  });
}

function handleWebSocketMessage(event: MessageEvent) {
  const result = parseInvokeResultMessage(event.data);
  if (!result) return;

  lastAnswer = now();
  const pending = pendingInvokes.get(result.id);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingInvokes.delete(result.id);
  pending.resolve(result.result);
}

function parseInvokeResultMessage(raw: unknown) {
  if (typeof raw !== "string") {
    return undefined;
  }

  try {
    const message = JSON.parse(raw) as InvokeResultMessage;
    if (
      message.type !== "custom" ||
      message.event !== answerEvent ||
      typeof message.data?.id !== "string"
    ) {
      return undefined;
    }
    return { id: message.data.id, result: message.data.result };
  } catch {
    return undefined;
  }
}

function rejectPendingInvokes(error: unknown) {
  for (const pending of pendingInvokes.values()) {
    clearTimeout(pending.timeoutId);
    pending.reject(error);
  }
  pendingInvokes.clear();
}

function createWebSocketUrl(info: WebSocketInfo) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = new URL(`${protocol}://${window.location.host}${info.path}`);
  url.searchParams.set("token", info.token);
  url.searchParams.set(webSocketQuery, "1");
  return url;
}

async function getWebSocketInfo() {
  webSocketInfoPromise ??= nativeFetch(webSocketInfoPath).then(async (response) => {
    if (!response.ok) {
      throw new Error("Failed to fetch React client websocket info");
    }
    return response.json() as Promise<WebSocketInfo>;
  });
  return webSocketInfoPromise;
}
