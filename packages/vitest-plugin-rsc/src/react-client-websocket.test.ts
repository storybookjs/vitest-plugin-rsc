import { describe, expect, it, vi } from "vitest";
import {
  REACT_CLIENT_WS_INVOKE_REQUEST,
  REACT_CLIENT_WS_INVOKE_RESPONSE,
  REACT_CLIENT_WS_PROTOCOL,
  createReactClientWebSocketInvokeTransport,
  resolveReactClientWebSocketUrl,
  type ReactClientWebSocketConfig,
} from "./react-client-websocket";
import {
  createReactClientWebSocketConfig,
  handleReactClientWebSocketRawMessage,
} from "./react-client-websocket-server";

const baseConfig: ReactClientWebSocketConfig = {
  protocol: "ws",
  host: "localhost",
  port: 5173,
  path: "/",
  token: "token",
  timeout: 1000,
};

describe("resolveReactClientWebSocketUrl", () => {
  it("uses Vite HMR host, clientPort, path, token, and explicit protocol", () => {
    expect(
      resolveReactClientWebSocketUrl(
        {
          protocol: "wss",
          host: "hmr.example.test",
          port: 9443,
          path: "/base/custom-hmr",
          token: "secret",
          timeout: 30000,
        },
        { protocol: "http:", hostname: "ignored.test", port: "5173" },
      ),
    ).toBe("wss://hmr.example.test:9443/base/custom-hmr?token=secret");
  });

  it("falls back to the browser location and https WebSocket protocol", () => {
    expect(
      resolveReactClientWebSocketUrl(
        {
          protocol: null,
          host: null,
          port: null,
          path: "vite-dev",
          token: "secret",
          timeout: 30000,
        },
        { protocol: "https:", hostname: "app.example.test", port: "4443" },
      ),
    ).toBe("wss://app.example.test:4443/vite-dev?token=secret");
  });
});

describe("createReactClientWebSocketConfig", () => {
  it("mirrors Vite HMR URL inputs", () => {
    const config = createReactClientWebSocketConfig({
      base: "/app/",
      webSocketToken: "secret",
      server: {
        hmr: {
          clientPort: 9443,
          host: "hmr.example.test",
          path: "ws",
          protocol: "wss",
          timeout: 1234,
        },
        middlewareMode: false,
      },
    } as never);

    expect(config).toEqual({
      protocol: "wss",
      host: "hmr.example.test",
      port: 9443,
      path: "/app/ws",
      token: "secret",
      timeout: 1234,
    });
  });
});

describe("createReactClientWebSocketInvokeTransport", () => {
  it("matches concurrent invoke responses by id", async () => {
    const transport = createTransport({ idFactory: createIdFactory(["a", "b"]) });

    const first = transport.invoke!({ type: "custom", event: "first" });
    const second = transport.invoke!({ type: "custom", event: "second" });
    const websocket = FakeWebSocket.instances[0]!;
    websocket.open();
    await waitForSentMessages(websocket, 2);

    expect(websocket.protocols).toBe(REACT_CLIENT_WS_PROTOCOL);
    expect(websocket.sent.map((message) => JSON.parse(message))).toEqual(
      expect.arrayContaining([
        {
          type: REACT_CLIENT_WS_INVOKE_REQUEST,
          id: "a",
          payload: { type: "custom", event: "first" },
        },
        {
          type: REACT_CLIENT_WS_INVOKE_REQUEST,
          id: "b",
          payload: { type: "custom", event: "second" },
        },
      ]),
    );
    expect(websocket.sent.map((message) => JSON.parse(message))).toHaveLength(2);

    websocket.message(
      JSON.stringify({
        type: REACT_CLIENT_WS_INVOKE_RESPONSE,
        id: "b",
        response: { result: "second-result" },
      }),
    );
    websocket.message(
      JSON.stringify({
        type: REACT_CLIENT_WS_INVOKE_RESPONSE,
        id: "a",
        response: { result: "first-result" },
      }),
    );

    await expect(first).resolves.toEqual({ result: "first-result" });
    await expect(second).resolves.toEqual({ result: "second-result" });
  });

  it("preserves handleInvoke error responses", async () => {
    const transport = createTransport({ idFactory: createIdFactory(["a"]) });
    const invoke = transport.invoke!({ type: "custom", event: "error" });
    const websocket = FakeWebSocket.instances[0]!;
    websocket.open();
    await waitForSentMessages(websocket, 1);

    websocket.message(
      JSON.stringify({
        type: REACT_CLIENT_WS_INVOKE_RESPONSE,
        id: "a",
        response: {
          error: {
            name: "RollupError",
            message: "boom",
            stack: "stack",
            plugin: "react-client",
          },
        },
      }),
    );

    await expect(invoke).resolves.toEqual({
      error: {
        name: "RollupError",
        message: "boom",
        stack: "stack",
        plugin: "react-client",
      },
    });
  });

  it("rejects pending invokes when the server closes the socket", async () => {
    const transport = createTransport({ idFactory: createIdFactory(["a"]) });
    const invoke = transport.invoke!({ type: "custom", event: "close" });
    const websocket = FakeWebSocket.instances[0]!;
    websocket.open();
    await waitForSentMessages(websocket, 1);

    websocket.close();

    await expect(invoke).rejects.toThrow("closed before the invoke response arrived");
  });

  it("rejects pending invokes on malformed messages", async () => {
    const transport = createTransport({ idFactory: createIdFactory(["a"]) });
    const invoke = transport.invoke!({ type: "custom", event: "malformed" });
    const websocket = FakeWebSocket.instances[0]!;
    websocket.open();
    await waitForSentMessages(websocket, 1);

    websocket.message(JSON.stringify({ type: "not-ours", id: "a", response: { result: null } }));

    await expect(invoke).rejects.toThrow("unexpected message");
  });

  it("rejects invokes that exceed the configured timeout", async () => {
    const transport = createTransport({
      config: { ...baseConfig, timeout: 1 },
      idFactory: createIdFactory(["a"]),
    });
    const invoke = transport.invoke!({ type: "custom", event: "timeout" });
    const websocket = FakeWebSocket.instances[0]!;
    const assertion = expect(invoke).rejects.toThrow("timed out after 1ms");
    websocket.open();

    await assertion;
  });
});

describe("handleReactClientWebSocketRawMessage", () => {
  it("sends the handleInvoke response without changing its error shape", async () => {
    const ws = {
      close: vi.fn(),
      send: vi.fn(),
    };

    await handleReactClientWebSocketRawMessage(
      JSON.stringify({
        type: REACT_CLIENT_WS_INVOKE_REQUEST,
        id: "1",
        payload: { type: "custom", event: "vite:invoke" },
      }),
      async () => ({
        error: {
          name: "TransportError",
          message: "invokeHandlers is not set",
          stack: "stack",
        },
      }),
      ws,
    );

    expect(ws.close).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]![0])).toEqual({
      type: REACT_CLIENT_WS_INVOKE_RESPONSE,
      id: "1",
      response: {
        error: {
          name: "TransportError",
          message: "invokeHandlers is not set",
          stack: "stack",
        },
      },
    });
  });
});

function createTransport({
  config = baseConfig,
  idFactory = createIdFactory(["a"]),
}: {
  config?: ReactClientWebSocketConfig;
  idFactory?: () => string;
} = {}) {
  FakeWebSocket.instances.length = 0;
  return createReactClientWebSocketInvokeTransport(config, {
    WebSocket: FakeWebSocket,
    idFactory,
  });
}

function createIdFactory(ids: string[]) {
  let index = 0;
  return () => ids[index++]!;
}

async function waitForSentMessages(websocket: FakeWebSocket, count: number) {
  await expect.poll(() => websocket.sent.length).toBe(count);
}

interface FakeWebSocketEventMap {
  open: Event;
  close: CloseEvent;
  error: Event;
  message: MessageEvent;
}

type Listener = (event: FakeWebSocketEventMap[keyof FakeWebSocketEventMap]) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly listeners = new Map<string, Listener[]>();
  readonly sent: string[] = [];
  readonly url: string;
  readonly protocols: string | string[];
  readyState = 0;

  constructor(url: string, protocols: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }

  addEventListener<K extends keyof FakeWebSocketEventMap>(
    type: K,
    listener: (event: FakeWebSocketEventMap[K]) => void,
  ) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener as Listener);
    this.listeners.set(type, listeners);
  }

  close() {
    this.readyState = 3;
    this.emit("close", {} as CloseEvent);
  }

  open() {
    this.readyState = 1;
    this.emit("open", new Event("open"));
  }

  message(data: string) {
    this.emit("message", { data } as MessageEvent);
  }

  send(data: string) {
    this.sent.push(data);
  }

  private emit<K extends keyof FakeWebSocketEventMap>(type: K, event: FakeWebSocketEventMap[K]) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}
