import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { HotPayload, ResolvedConfig, ViteDevServer } from "vite";
import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";
import {
  REACT_CLIENT_WS_INVOKE_REQUEST,
  REACT_CLIENT_WS_INVOKE_RESPONSE,
  REACT_CLIENT_WS_PROTOCOL,
  type ReactClientInvokeRequest,
  type ReactClientInvokeResponse,
  type ReactClientInvokeResult,
  type ReactClientWebSocketConfig,
} from "./react-client-websocket";

type HandleInvoke = (payload: HotPayload) => Promise<ReactClientInvokeResult>;

export function createReactClientWebSocketConfig(
  config: ResolvedConfig,
): ReactClientWebSocketConfig {
  const hmrConfig = typeof config.server.hmr === "object" ? config.server.hmr : undefined;
  const hasHmrServer = !!hmrConfig?.server;
  let port = hmrConfig?.clientPort ?? hmrConfig?.port ?? null;

  if (config.server.middlewareMode && !hasHmrServer) {
    port ??= 24678;
  }

  return {
    protocol: hmrConfig?.protocol ?? null,
    host: hmrConfig?.host ?? null,
    port,
    path: createReactClientWebSocketPath(config.base, hmrConfig?.path),
    token: config.webSocketToken,
    timeout: hmrConfig?.timeout ?? 30000,
  };
}

export function createReactClientWebSocketPath(base: string, hmrPath: string | undefined): string {
  if (!hmrPath) {
    return base;
  }

  return path.posix.join(base, hmrPath);
}

export function installReactClientWebSocketBridge(server: ViteDevServer): () => void {
  const httpServer = server.httpServer;
  if (!httpServer) {
    return () => {};
  }

  const wss = new WebSocketServer({ noServer: true });
  const websocketPath = createReactClientWebSocketConfig(server.config).path;

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!request.url) {
      return;
    }

    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== websocketPath || !hasReactClientProtocol(request)) {
      return;
    }

    if (!hasValidToken(server.config.webSocketToken, url)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  };

  const close = () => {
    httpServer.off("upgrade", onUpgrade);
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close();
  };

  httpServer.on("upgrade", onUpgrade);
  httpServer.once("close", close);

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      void handleReactClientWebSocketRawMessage(
        raw,
        (payload) => server.environments["react_client"]!.hot.handleInvoke(payload),
        ws,
      );
    });
  });

  return close;
}

export async function handleReactClientWebSocketRawMessage(
  raw: RawData | string,
  handleInvoke: HandleInvoke,
  ws: Pick<WebSocket, "close" | "send">,
): Promise<void> {
  let request: ReactClientInvokeRequest;

  try {
    request = parseReactClientInvokeRequest(raw);
  } catch {
    ws.close();
    return;
  }

  const response: ReactClientInvokeResponse = {
    type: REACT_CLIENT_WS_INVOKE_RESPONSE,
    id: request.id,
    response: await invokeReactClient(handleInvoke, request.payload),
  };

  ws.send(JSON.stringify(response));
}

export function parseReactClientInvokeRequest(raw: RawData | string): ReactClientInvokeRequest {
  const data = typeof raw === "string" ? raw : raw.toString();
  const parsed: unknown = JSON.parse(data);

  if (!isObject(parsed)) {
    throw new Error("React client WebSocket received a malformed request.");
  }

  if (
    parsed.type !== REACT_CLIENT_WS_INVOKE_REQUEST ||
    typeof parsed.id !== "string" ||
    !("payload" in parsed)
  ) {
    throw new Error("React client WebSocket received an unexpected request.");
  }

  return parsed as unknown as ReactClientInvokeRequest;
}

async function invokeReactClient(
  handleInvoke: HandleInvoke,
  payload: HotPayload,
): Promise<ReactClientInvokeResult> {
  try {
    return await handleInvoke(payload);
  } catch (error) {
    return { error: serializeError(error) };
  }
}

function hasReactClientProtocol(request: IncomingMessage) {
  const protocol = request.headers["sec-websocket-protocol"];
  if (!protocol) {
    return false;
  }

  return protocol
    .split(",")
    .map((value) => value.trim())
    .includes(REACT_CLIENT_WS_PROTOCOL);
}

function hasValidToken(expectedToken: string, url: URL) {
  const token = url.searchParams.get("token");
  if (!token) {
    return false;
  }

  const actual = Buffer.from(token);
  const expected = Buffer.from(expectedToken);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    for (const key of Object.keys(error)) {
      serialized[key] = (error as unknown as Record<string, unknown>)[key];
    }

    return serialized;
  }

  return {
    name: "Error",
    message: String(error),
    stack: new Error().stack,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
