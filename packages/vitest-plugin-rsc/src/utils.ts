import {
  createDefaultImportMeta,
  ESModulesEvaluator,
  ModuleRunner,
  type ModuleRunnerTransport,
} from "vite/module-runner";
import builtLayers, { type BuiltLayer } from "virtual:vitest-plugin-rsc/layers";
import * as pageClient from "virtual:vitest-plugin-rsc/vite-client";

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
const sourceUrlRE = /\/\/# sourceURL=[^\n\r]*/;

type InvokePayload = Parameters<NonNullable<ModuleRunnerTransport["invoke"]>>[0];
type InvokeResult = Awaited<ReturnType<NonNullable<ModuleRunnerTransport["invoke"]>>>;
type ViteFetchResult = {
  code: string;
  file: string;
};

type WebSocketInfo = { token: string; path: string };
type PendingInvoke = {
  resolve: (result: InvokeResult) => void;
  reject: (error: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};
type InvokeResultMessage = {
  type?: string;
  event?: string;
  data?: {
    id?: string;
    result?: InvokeResult;
  };
};

// Before anything replaces it: this request is for the dev server.
const nativeFetch = globalThis.fetch;

let webSocket: WebSocket | undefined;
let webSocketPromise: Promise<WebSocket> | undefined;
let webSocketInfoPromise: Promise<WebSocketInfo> | undefined;
let nextInvokeId = 0;
const invokeTimeout = 30_000;

const pendingInvokes = new Map<string, PendingInvoke>();

const runners = new Map<string, ModuleRunner>();

// One module runner per Vite environment that runs in the page next to the
// browser tests. All of them share this websocket.
function getRunner(environment: string): ModuleRunner {
  let runner = runners.get(environment);
  if (!runner) runners.set(environment, (runner = createEnvironmentRunner(environment)));
  return runner;
}

/**
 * A module runner with a module graph of its own: every module it imports is
 * evaluated again, the way a page load evaluates a page's scripts again.
 */
export function createEnvironmentRunner(environment: string): ModuleRunner {
  const built = builtLayers?.[environment];
  return new ModuleRunner(
    {
      sourcemapInterceptor: false,
      transport: {
        invoke: (payload) =>
          built ? invokeBuilt(built, payload) : invokeEnvironment(environment, payload),
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
    new ESModulesEvaluator(),
  );
}

/**
 * What a runner imports a module of an environment by: its id, or in a build
 * the file that the module is the entry of.
 */
export function environmentModule(environment: string, id: string): string {
  const entry = builtLayers?.[environment]?.entries[id];
  return entry ? `/${entry}` : id;
}

export function importEnvironment<T = any>(environment: string, id: string): Promise<T> {
  return getRunner(environment).import<T>(environmentModule(environment, id));
}

export function importReactClient<T = any>(id: string): Promise<T> {
  return importEnvironment<T>("react_client", id);
}

// A static build has no dev server to ask for a module. The environments that
// run through a module runner were built into files of the format the runner
// evaluates, and those are fetched like any file of the site: see
// nextjs/build.ts. A module is a file, and its id the path of that file in
// the directory of its environment.
const builtModules = new Map<string, Promise<string>>();

function builtUrl(layer: BuiltLayer, file: string): string {
  return new URL(file.replace(/^\/+/, ""), layer.base).href;
}

async function invokeBuilt(layer: BuiltLayer, payload: InvokePayload): Promise<InvokeResult> {
  const { name, data } = (payload as { data: { name: string; data: unknown[] } }).data;
  if (name === "getBuiltins") return { result: [] } as InvokeResult;
  if (name !== "fetchModule") {
    return { error: { message: `vitest-plugin-rsc: a build has no "${name}"` } } as InvokeResult;
  }
  const [id] = data as [string];
  const url = builtUrl(layer, id);
  let code = builtModules.get(url);
  if (!code) {
    builtModules.set(
      url,
      (code = nativeFetch(url).then((response) => {
        if (!response.ok) throw new Error(`vitest-plugin-rsc: ${url} responded with ${response.status}`);
        return response.text();
      })),
    );
    // Not kept when it fails: the next page load asks again.
    code.catch(() => builtModules.delete(url));
  }
  try {
    return { result: { code: await code, file: id, id, url: id, invalidate: false } } as InvokeResult;
  } catch (error) {
    return { error: { message: String(error instanceof Error ? error.message : error) } } as InvokeResult;
  }
}

// What a browser's HTTP cache is to a page load: a module graph that is
// evaluated again (see createEnvironmentRunner) does not have to fetch the
// code of a dependency again. Source files are fetched every time, since they
// change while the tests are being watched.
const dependencyModules = new Map<string, InvokeResult>();

async function invokeEnvironment(environment: string, payload: InvokePayload) {
  const key = environment + JSON.stringify(payload);
  let result = dependencyModules.get(key);
  if (!result) {
    result = await invokeOverWebSocket(environment, payload);
    if (
      isInvokeSuccess(result) &&
      isViteFetchResult(result.result) &&
      isNodeModuleFile(result.result.file)
    ) {
      dependencyModules.set(key, result);
    }
  }
  // Coverage is collected for the modules the browser itself runs.
  return environment === "react_client" ? await withReactClientCoverage(result) : result;
}

async function withReactClientCoverage(result: InvokeResult) {
  if (
    !isCoverageEnabled() ||
    !isInvokeSuccess(result) ||
    !isViteFetchResult(result.result) ||
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

async function invokeOverWebSocket(environment: string, payload: InvokePayload) {
  const socket = await getReactClientWebSocket();
  const id = String(++nextInvokeId);

  return new Promise<InvokeResult>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingInvokes.delete(id);
      reject(new Error(`React client websocket invoke timed out: ${id}`));
    }, invokeTimeout);

    pendingInvokes.set(id, { resolve, reject, timeoutId });
    try {
      socket.send(
        JSON.stringify({
          type: "custom",
          event: reactClientWebSocketInvokeEvent,
          data: { id, environment, payload },
        }),
      );
    } catch (error) {
      clearTimeout(timeoutId);
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
    return {
      id: message.data.id,
      result: message.data.result as InvokeResult,
    };
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
