import { ESModulesEvaluator, ModuleRunner, type ModuleRunnerTransport } from "vite/module-runner";

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

type WebSocketInfo = {
  token: string;
  protocol: string | null;
  host: string | null;
  port: number | null;
  path: string;
  timeout: number;
};
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

let webSocket: WebSocket | undefined;
let webSocketPromise: Promise<WebSocket> | undefined;
let webSocketInfoPromise: Promise<WebSocketInfo> | undefined;
let nextInvokeId = 0;

const pendingInvokes = new Map<string, PendingInvoke>();

const runner = new ModuleRunner(
  {
    sourcemapInterceptor: false,
    transport: {
      invoke: invokeReactClient,
    },
    hmr: false,
  },
  new ESModulesEvaluator(),
);

export const importReactClient = runner.import.bind(runner);

async function invokeReactClient(payload: InvokePayload) {
  return await withReactClientCoverage(await invokeReactClientOverWebSocket(payload));
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
  await fetch(reactClientCoverageModulePath, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ file, code }),
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

async function invokeReactClientOverWebSocket(payload: InvokePayload) {
  const socket = await getReactClientWebSocket();
  const info = await getWebSocketInfo();
  const id = String(++nextInvokeId);

  return new Promise<InvokeResult>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingInvokes.delete(id);
      reject(new Error(`React client websocket invoke timed out: ${id}`));
    }, info.timeout);

    pendingInvokes.set(id, { resolve, reject, timeoutId });
    try {
      socket.send(
        JSON.stringify({
          type: "custom",
          event: reactClientWebSocketInvokeEvent,
          data: { id, payload },
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
  const protocol = info.protocol ?? (window.location.protocol === "https:" ? "wss" : "ws");
  let host = window.location.host;

  if (info.host || info.port != null) {
    host = `${info.host ?? window.location.hostname}${info.port == null ? "" : `:${info.port}`}`;
  }

  const url = new URL(`${protocol}://${host}${info.path}`);
  url.searchParams.set("token", info.token);
  url.searchParams.set(reactClientWebSocketQuery, "1");
  return url;
}

async function getWebSocketInfo() {
  webSocketInfoPromise ??= fetch(reactClientWebSocketInfoPath).then(async (response) => {
    if (!response.ok) {
      throw new Error("Failed to fetch React client websocket info");
    }
    return response.json() as Promise<WebSocketInfo>;
  });
  return webSocketInfoPromise;
}
