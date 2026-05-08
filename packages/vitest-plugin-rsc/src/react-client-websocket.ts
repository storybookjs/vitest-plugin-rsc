import type { ModuleRunnerTransport } from "vite/module-runner";
import type { HotPayload } from "vite";

export const REACT_CLIENT_WS_PROTOCOL = "vitest-rsc-react-client";
export const REACT_CLIENT_WS_CONFIG_ID = "virtual:vitest-plugin-rsc/react-client-websocket-config";
export const REACT_CLIENT_WS_CONFIG_RESOLVED_ID = `\0${REACT_CLIENT_WS_CONFIG_ID}`;

export const REACT_CLIENT_WS_INVOKE_REQUEST = "vitest-plugin-rsc:react-client:invoke";
export const REACT_CLIENT_WS_INVOKE_RESPONSE = "vitest-plugin-rsc:react-client:invoke-response";

export interface ReactClientWebSocketConfig {
  protocol: string | null;
  host: string | null;
  port: number | null;
  path: string;
  token: string;
  timeout: number;
}

export interface ReactClientWebSocketLocation {
  protocol: string;
  hostname: string;
  port: string;
}

export type ReactClientInvokeResult = { result: unknown } | { error: unknown };

export interface ReactClientInvokeRequest {
  type: typeof REACT_CLIENT_WS_INVOKE_REQUEST;
  id: string;
  payload: HotPayload;
}

export interface ReactClientInvokeResponse {
  type: typeof REACT_CLIENT_WS_INVOKE_RESPONSE;
  id: string;
  response: ReactClientInvokeResult;
}

interface TransportWebSocketEventMap {
  open: Event;
  close: CloseEvent;
  error: Event;
  message: MessageEvent;
}

interface TransportWebSocket {
  readonly readyState: number;
  addEventListener<K extends keyof TransportWebSocketEventMap>(
    type: K,
    listener: (event: TransportWebSocketEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  close(): void;
  send(data: string): void;
}

interface TransportWebSocketConstructor {
  new (url: string, protocols: string | string[]): TransportWebSocket;
}

export interface ReactClientWebSocketTransportOptions {
  WebSocket?: TransportWebSocketConstructor;
  idFactory?: () => string;
}

interface PendingInvoke {
  resolve: (response: ReactClientInvokeResult) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout> | undefined;
}

const WEBSOCKET_OPEN = 1;

export function resolveReactClientWebSocketUrl(
  config: ReactClientWebSocketConfig,
  location: ReactClientWebSocketLocation = globalThis.location,
): string {
  const protocol = config.protocol ?? (location.protocol === "https:" ? "wss" : "ws");
  const host = config.host ?? location.hostname;
  const port = config.port ?? (location.port ? Number(location.port) : null);
  const path = config.path.startsWith("/") ? config.path : `/${config.path}`;
  const url = new URL(`${protocol}://${host}${port == null ? "" : `:${port}`}${path}`);
  url.searchParams.set("token", config.token);
  return url.toString();
}

export function createReactClientWebSocketInvokeTransport(
  config: ReactClientWebSocketConfig,
  options: ReactClientWebSocketTransportOptions = {},
): Pick<ModuleRunnerTransport, "disconnect" | "invoke"> {
  const WebSocketConstructor = options.WebSocket ?? globalThis.WebSocket;
  const idFactory = options.idFactory ?? createIncrementingIdFactory();
  const pendingInvokes = new Map<string, PendingInvoke>();

  let socket: TransportWebSocket | undefined;
  let socketPromise: Promise<TransportWebSocket> | undefined;

  function rejectPending(error: Error) {
    for (const pending of pendingInvokes.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    pendingInvokes.clear();
  }

  async function getSocket(): Promise<TransportWebSocket> {
    if (socket?.readyState === WEBSOCKET_OPEN) {
      return socket;
    }

    if (socketPromise) {
      return socketPromise;
    }

    socketPromise = new Promise<TransportWebSocket>((resolve, reject) => {
      const nextSocket = new WebSocketConstructor(
        resolveReactClientWebSocketUrl(config),
        REACT_CLIENT_WS_PROTOCOL,
      );
      socket = nextSocket;
      let didOpen = nextSocket.readyState === WEBSOCKET_OPEN;

      nextSocket.addEventListener(
        "open",
        () => {
          didOpen = true;
          resolve(nextSocket);
        },
        { once: true },
      );

      nextSocket.addEventListener(
        "error",
        () => {
          if (!didOpen) {
            reject(new Error("React client WebSocket failed to connect."));
          }
        },
        { once: true },
      );

      nextSocket.addEventListener("close", () => {
        socket = undefined;
        socketPromise = undefined;

        const error = didOpen
          ? new Error("React client WebSocket closed before the invoke response arrived.")
          : new Error("React client WebSocket closed before it opened.");

        if (!didOpen) {
          reject(error);
        }
        rejectPending(error);
      });

      nextSocket.addEventListener("message", (event) => {
        let response: ReactClientInvokeResponse;
        try {
          response = parseReactClientInvokeResponse(event.data);
        } catch (error) {
          rejectPending(error instanceof Error ? error : new Error(String(error)));
          nextSocket.close();
          return;
        }

        const pending = pendingInvokes.get(response.id);
        if (!pending) {
          return;
        }

        clearTimeout(pending.timeoutId);
        pendingInvokes.delete(response.id);
        pending.resolve(response.response);
      });

      if (didOpen) {
        resolve(nextSocket);
      }
    });

    return socketPromise;
  }

  return {
    disconnect() {
      socket?.close();
      socket = undefined;
      socketPromise = undefined;
      rejectPending(new Error("React client WebSocket transport was disconnected."));
    },
    async invoke(payload) {
      const id = idFactory();
      const request: ReactClientInvokeRequest = {
        type: REACT_CLIENT_WS_INVOKE_REQUEST,
        id,
        payload,
      };

      const activeSocket = await getSocket();

      return await new Promise<ReactClientInvokeResult>((resolve, reject) => {
        const timeoutId =
          config.timeout > 0
            ? setTimeout(() => {
                pendingInvokes.delete(id);
                reject(
                  new Error(`React client WebSocket invoke timed out after ${config.timeout}ms.`),
                );
              }, config.timeout)
            : undefined;

        timeoutId?.unref?.();
        pendingInvokes.set(id, { resolve, reject, timeoutId });

        try {
          activeSocket.send(JSON.stringify(request));
        } catch (error) {
          clearTimeout(timeoutId);
          pendingInvokes.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
  };
}

export function parseReactClientInvokeResponse(data: unknown): ReactClientInvokeResponse {
  if (typeof data !== "string") {
    throw new Error("React client WebSocket received a non-string message.");
  }

  const parsed: unknown = JSON.parse(data);

  if (!isObject(parsed)) {
    throw new Error("React client WebSocket received a malformed message.");
  }

  if (
    parsed.type !== REACT_CLIENT_WS_INVOKE_RESPONSE ||
    typeof parsed.id !== "string" ||
    !isInvokeResult(parsed.response)
  ) {
    throw new Error("React client WebSocket received an unexpected message.");
  }

  return parsed as unknown as ReactClientInvokeResponse;
}

function createIncrementingIdFactory() {
  let id = 0;
  return () => String(++id);
}

function isInvokeResult(value: unknown): value is ReactClientInvokeResult {
  return isObject(value) && ("result" in value || "error" in value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
