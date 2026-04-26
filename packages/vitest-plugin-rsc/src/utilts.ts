import {
  ESModulesEvaluator,
  ModuleRunner,
  type ModuleRunnerTransport,
} from "vite/module-runner";

const reactClientInvokePath = "/@vite/invoke-react-client";
const reactClientWebSocketInfoPath = "/@vite/react-client-runner-websocket";
const reactClientWebSocketQuery = "vitest-plugin-rsc-react-client";
const reactClientWebSocketInvokeEvent = "vitest-plugin-rsc:react-client:invoke";
const reactClientWebSocketInvokeResultEvent =
  "vitest-plugin-rsc:react-client:invoke-result";

type InvokePayload = Parameters<
  NonNullable<ModuleRunnerTransport["invoke"]>
>[0];
type InvokeResult = Awaited<
  ReturnType<NonNullable<ModuleRunnerTransport["invoke"]>>
>;

type WebSocketInfo = {
  token: string;
  protocol: string | null;
  host: string | null;
  port: number | null;
  path: string;
  timeout: number;
};

let webSocket: WebSocket | undefined;
let webSocketPromise: Promise<WebSocket> | undefined;
let webSocketInfoPromise: Promise<WebSocketInfo> | undefined;
let webSocketUnavailable = false;
let nextInvokeId = 0;

const pendingInvokes = new Map<
  string,
  {
    resolve: (result: InvokeResult) => void;
    reject: (error: unknown) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();

const runner = new ModuleRunner(
  {
    sourcemapInterceptor: false,
    transport: {
      invoke: async (payload) => {
        if (!webSocketUnavailable && typeof WebSocket !== "undefined") {
          try {
            return await invokeReactClientOverWebSocket(payload);
          } catch {
            webSocketUnavailable = true;
          }
        }

        return invokeReactClientOverHttp(payload);
      },
    },
    hmr: false,
  },
  new ESModulesEvaluator(),
);

export const importReactClient = runner.import.bind(runner);

async function invokeReactClientOverHttp(payload: InvokePayload) {
  const response = await fetch(
    `${reactClientInvokePath}?` +
      new URLSearchParams({
        data: JSON.stringify(payload),
      }),
  );
  return response.json() as Promise<InvokeResult>;
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

  if (webSocketPromise) {
    return webSocketPromise;
  }

  webSocketPromise = (async () => {
    const info = await getWebSocketInfo();
    const socket = new WebSocket(createWebSocketUrl(info), "vite-hmr");

    socket.addEventListener("message", handleWebSocketMessage);
    socket.addEventListener("close", () => {
      if (webSocket === socket) {
        webSocket = undefined;
      }
      rejectPendingInvokes(
        new Error("React client websocket connection closed"),
      );
    });

    await new Promise<void>((resolve, reject) => {
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

    webSocket = socket;
    return socket;
  })().finally(() => {
    webSocketPromise = undefined;
  });

  return webSocketPromise;
}

function handleWebSocketMessage(event: MessageEvent) {
  if (typeof event.data !== "string") {
    return;
  }

  let payload:
    | {
        type: "custom";
        event: string;
        data: { id: string; result: InvokeResult };
      }
    | undefined;

  try {
    payload = JSON.parse(event.data);
  } catch {
    return;
  }

  if (
    payload?.type !== "custom" ||
    payload.event !== reactClientWebSocketInvokeResultEvent
  ) {
    return;
  }

  const pending = pendingInvokes.get(payload.data.id);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingInvokes.delete(payload.data.id);
  pending.resolve(payload.data.result);
}

function rejectPendingInvokes(error: unknown) {
  for (const pending of pendingInvokes.values()) {
    clearTimeout(pending.timeoutId);
    pending.reject(error);
  }
  pendingInvokes.clear();
}

function createWebSocketUrl(info: WebSocketInfo) {
  const protocol =
    info.protocol ?? (window.location.protocol === "https:" ? "wss" : "ws");
  let host = window.location.host;

  if (info.host || info.port != null) {
    host = `${info.host ?? window.location.hostname}${
      info.port == null ? "" : `:${info.port}`
    }`;
  }

  const url = new URL(`${protocol}://${host}${info.path}`);
  url.searchParams.set("token", info.token);
  url.searchParams.set(reactClientWebSocketQuery, "1");
  return url;
}

async function getWebSocketInfo() {
  webSocketInfoPromise ??= fetch(reactClientWebSocketInfoPath).then(
    async (response) => {
      if (!response.ok) {
        throw new Error("Failed to fetch React client websocket info");
      }
      return response.json() as Promise<WebSocketInfo>;
    },
  );
  return webSocketInfoPromise;
}
