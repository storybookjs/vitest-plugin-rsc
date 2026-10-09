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
  type ModuleRunnerTransport,
} from "vite/module-runner";
import builtLayers, { hostModules, type BuiltLayer } from "virtual:vitest-plugin-rsc/layers";
import * as pageClient from "virtual:vitest-plugin-rsc/vite-client";
import { isHostModule } from "./host-module.ts";

// The page's own instance of Vite's client, for the modules that the runners
// below evaluate: see vite-client.ts.
(globalThis as { __vitest_plugin_rsc_vite_client__?: unknown }).__vitest_plugin_rsc_vite_client__ =
  pageClient;

const reactClientCoverageModulePath = "/@vite/react-client-coverage-module";
const reactClientWebSocketInfoPath = "/@vite/react-client-runner-websocket";
const reactClientWebSocketQuery = "vitest-plugin-rsc-react-client";
const reactClientCoverageQuery = "vitest-plugin-rsc-react-client-coverage";
const reactClientWebSocketInvokeEvent = "vitest-plugin-rsc:react-client:invoke";
const reactClientWebSocketInvokeResultEvent = "vitest-plugin-rsc:react-client:invoke-result";
const reactClientWebSocketVersionEvent = "vitest-plugin-rsc:react-client:version";
const sourceUrlRE = /\/\/# sourceURL=[^\n\r]*/;
const sourceUrlLineRE = /^\/\/# sourceURL=/m;

type InvokePayload = Parameters<NonNullable<ModuleRunnerTransport["invoke"]>>[0];
type InvokeResult = Awaited<ReturnType<NonNullable<ModuleRunnerTransport["invoke"]>>>;
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
  timeoutId: ReturnType<typeof setTimeout>;
};
type InvokeResultMessage = {
  type?: string;
  event?: string;
  data?: {
    id?: string;
    result?: unknown;
  };
};

// Before anything replaces it: this request is for the dev server.
const nativeFetch = globalThis.fetch;

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
    runners.set(environment, (runner = createRunner(environment, invoke, createEvaluator())));
  }
  return runner;
}

// A runner of an environment. A module of the page is the page's own, and a
// static build has the modules of the environment in files of its own.
function createRunner(
  environment: string,
  invoke: NonNullable<ModuleRunnerTransport["invoke"]>,
  evaluator: ModuleEvaluator,
  { sourcemaps = false } = {},
): ModuleRunner {
  const built = builtLayers?.[environment];
  return new ModuleRunner(
    {
      // With `sourcemaps`, the stack of an error has the lines of the source
      // for a module of this runner, where it has the lines of what the
      // runner evaluates. For that every stack is formatted as Vite does it.
      sourcemapInterceptor: sourcemaps && !built ? "prepareStackTrace" : false,
      transport: {
        invoke: async (payload) =>
          hostModule(payload) ?? (built ? invokeBuilt(built, payload) : invoke(payload)),
      },
      hmr: false,
      // A module of a build is a file of it, and says so.
      ...(built && {
        createImportMeta: (file) => ({
          ...createDefaultImportMeta(file),
          url: builtUrl(built, file),
        }),
      }),
    },
    evaluator,
  );
}

/**
 * A module runner with a module graph of its own: every module it imports is
 * evaluated again, the way a page load evaluates a page's scripts again. Call
 * `checkFetchedModules()` before every page load, or a file that changed goes
 * unnoticed. So does a runner that lives longer than a page load, before it
 * imports a module again after a file changed.
 */
export function createEnvironmentRunner(
  environment: string,
  evaluator: ModuleEvaluator = createEvaluator(),
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
  return createRunner(environment, invoke, evaluator, { sourcemaps });
}

// A module of the page is not the environment's to serve: the runner imports
// it as the page does. See host-module.ts.
function hostModule(payload: InvokePayload): InvokeResult | undefined {
  const { name, data } = (payload as { data: { name: string; data: unknown[] } }).data;
  if (name !== "fetchModule" || !isHostModule(String(data[0]))) return;
  return { result: { externalize: data[0], type: "module" } } as InvokeResult;
}

/**
 * How a runner of the page evaluates a module: as `evaluator` does, which by
 * default compiles a module that the pages share once (`pageLoadEvaluator`),
 * and with the page's own module for a module of the page.
 */
export function createEvaluator(evaluator: ModuleEvaluator = pageLoadEvaluator): ModuleEvaluator {
  return {
    startOffset: evaluator.startOffset,
    runInlinedModule: (context, code, module) => evaluator.runInlinedModule(context, code, module),
    async runExternalModule(file) {
      if (!isHostModule(file)) return evaluator.runExternalModule(file);
      // What the page serves for a module of its own has that module as its
      // default export. A build has it in the build of the page.
      if (!hostModules) {
        return ((await evaluator.runExternalModule(file)) as { default?: unknown }).default;
      }
      const built = hostModules[file];
      if (!built) throw new Error(`vitest-plugin-rsc: the build has no module of the page ${file}`);
      return (await built()).default;
    },
  };
}

/**
 * What a runner imports a module of an environment by: its id, or in a build
 * the file that the module is the entry of.
 */
export function environmentModule(environment: string, id: string): string {
  const entry = builtLayers?.[environment]?.entries[id];
  return entry ? `/${entry}` : id;
}

export function importReactClient<T = any>(id: string): Promise<T> {
  return getRunner("react_client").import<T>(environmentModule("react_client", id));
}

// A static build has no dev server to ask for a module. The environments that
// run through a module runner were built into files of the format the runner
// evaluates, and those are fetched like any file of the site: see
// nextjs/build.ts. A module is a file, and its id the path of that file in
// the directory of its environment. The answer for a file is the same for
// every page, so `pageLoadEvaluator` compiles it once.
type BuiltModule = { code: string; file: string; id: string; url: string; invalidate: false };
const builtModules = new Map<string, Promise<BuiltModule>>();
// An import of a file of a build, by the path of the imported file: see
// `toRunnerModule()` in nextjs/build.ts. Not one with `import()`, which the
// module may never load.
const builtImportRE = /__vite_ssr_import__\("(\/[^"]+)"/g;

function builtUrl(layer: BuiltLayer, file: string): string {
  return new URL(file.replace(/^\/+/, ""), layer.base).href;
}

// As with a dev server (see `fetchOnce()`), what a file imports is fetched as
// soon as the file is there, all at once, and not one after the other as the
// runner asks for it.
function fetchBuilt(layer: BuiltLayer, id: string): Promise<BuiltModule> {
  const url = builtUrl(layer, id);
  let fetched = builtModules.get(url);
  if (fetched) return fetched;
  fetched = nativeFetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`vitest-plugin-rsc: ${url} responded with ${response.status}`);
    }
    const code = await response.text();
    for (const [, imported] of code.matchAll(builtImportRE)) {
      // A runner that asks for it gets the error.
      if (!isHostModule(imported!)) fetchBuilt(layer, imported!).catch(() => {});
    }
    return { code, file: id, id, url: id, invalidate: false };
  });
  builtModules.set(url, fetched);
  // Not kept when it fails: the next page load asks again.
  fetched.catch(() => builtModules.delete(url));
  return fetched;
}

async function invokeBuilt(layer: BuiltLayer, payload: InvokePayload): Promise<InvokeResult> {
  const { name, data } = (payload as { data: { name: string; data: unknown[] } }).data;
  if (name === "getBuiltins") return { result: [] } as InvokeResult;
  if (name !== "fetchModule") {
    return { error: { message: `vitest-plugin-rsc: a build has no "${name}"` } } as InvokeResult;
  }
  try {
    return { result: await fetchBuilt(layer, data[0] as string) } as InvokeResult;
  } catch (error) {
    return {
      error: { message: String(error instanceof Error ? error.message : error) },
    } as InvokeResult;
  }
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
// says that its modules are the ones that were fetched: see `moduleVersions`
// in index.ts.
type FetchedModules = { version: unknown; results: Map<string, Promise<InvokeResult>> };

const fetchedModulesOf = new Map<string, Promise<FetchedModules>>();

function fetchedModules(environment: string): Promise<FetchedModules> {
  return fetchedModulesOf.get(environment) ?? askForModules(environment);
}

// The modules that were fetched, when the server still has that version of
// its modules.
function askForModules(environment: string, known?: FetchedModules): Promise<FetchedModules> {
  const fetched = requestOverWebSocket(reactClientWebSocketVersionEvent, { environment }).then(
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
 * Asks the server whether the modules that were fetched are still its modules,
 * for the runners of `createEnvironmentRunner()`. Before a page load: a file
 * can change while the tests run.
 */
export async function checkFetchedModules(): Promise<void> {
  await Promise.all(
    [...fetchedModulesOf].map(async ([environment, fetched]) =>
      askForModules(environment, await fetched.catch(() => undefined)),
    ),
  );
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
  runExternalModule: (file) => import(/* @vite-ignore */ file),
};

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
  return requestOverWebSocket(reactClientWebSocketInvokeEvent, {
    environment,
    payload,
  }) as Promise<InvokeResult>;
}

async function requestOverWebSocket(event: string, data: object): Promise<unknown> {
  const socket = await getReactClientWebSocket();
  const id = String(++nextInvokeId);

  return new Promise((resolve, reject) => {
    const sent = now();
    const pending: PendingInvoke = {
      resolve,
      reject,
      timeoutId: setTimeout(expire, invokeTimeout),
    };
    function expire() {
      const silent = now() - Math.max(sent, lastAnswer);
      if (silent < invokeTimeout) {
        pending.timeoutId = setTimeout(expire, invokeTimeout - silent);
        return;
      }
      pendingInvokes.delete(id);
      reject(new Error(`React client websocket invoke timed out: ${id}`));
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
      message.event !== reactClientWebSocketInvokeResultEvent ||
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
  url.searchParams.set(reactClientWebSocketQuery, "1");
  return url;
}

async function getWebSocketInfo() {
  webSocketInfoPromise ??= nativeFetch(reactClientWebSocketInfoPath).then(async (response) => {
    if (!response.ok) {
      throw new Error("Failed to fetch React client websocket info");
    }
    return response.json() as Promise<WebSocketInfo>;
  });
  return webSocketInfoPromise;
}
