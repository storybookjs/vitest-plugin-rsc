import type { PageHost, PageNews } from "./page-host.ts";
import { answerEvent, webSocketInfoPath, webSocketQuery } from "./page-protocol.ts";

// The host of a page in a browser: its requests to the dev server go over a
// WebSocket of the page's own, next to Vite's, and the browser has the
// navigations and loads the stylesheets. See page-host.ts.

type WebSocketInfo = { token: string; path: string };
type PendingInvoke = {
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout> | undefined;
};
type SocketMessage = { type?: string; event?: string; data?: unknown };

const AsyncFunction = async function () {}.constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

// Before anything replaces it, like a mock of the network.
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
// What the page listens to the server with: the socket brings the news and
// the answers in the order the server sent them.
const listeners = new Set<PageNews>();
// The page's own, before a browser context of the plugin's replaces it.
const pageFetch = globalThis.fetch;

const browserHost: PageHost = {
  request: requestOverWebSocket,
  listen: (listener) => {
    listeners.add(listener);
  },
  navigation: (window as { navigation?: EventTarget }).navigation,
  loadsStylesheets: true,
  serverFetch: (input, init) => pageFetch(input, init),
  compileInPage: (params, body) => new AsyncFunction(...params, body),
  // No browser hands over what a page sends.
  interceptRequests: () => false,
  serverDir: "",
  serverImmediate,
  immediatesOfRuntime: false,
};
export default browserHost;

// A task each, by a message of one channel, in the order they were asked for.
const immediates = new Map<symbol, () => void>();
const channel = new MessageChannel();
channel.port1.onmessage = () => {
  const [id, run] = immediates.entries().next().value ?? [];
  if (id === undefined) return;
  immediates.delete(id);
  run!();
};
function serverImmediate(callback: () => void): () => void {
  const id = Symbol("immediate");
  immediates.set(id, callback);
  channel.port2.postMessage(null);
  return () => immediates.delete(id);
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
    // Also one that closes after the next has opened: it may have missed
    // news.
    for (const listener of listeners) listener.missed();
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
  const message = parseMessage(event.data);
  if (message?.type !== "custom" || typeof message.event !== "string") return;
  if (message.event !== answerEvent) {
    for (const listener of listeners) listener.heard(message.event, message.data);
    return;
  }
  const { id, result } = (message.data ?? {}) as { id?: unknown; result?: unknown };
  if (typeof id !== "string") return;

  lastAnswer = now();
  const pending = pendingInvokes.get(id);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingInvokes.delete(id);
  pending.resolve(result);
}

function parseMessage(raw: unknown): SocketMessage | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw) as SocketMessage;
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
