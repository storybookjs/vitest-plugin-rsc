// The first setup file: records the websockets the browser opens from here on,
// for client-counter/vite-client.test.tsx. The list is on the global: the
// browser gets this module once as a setup file and once more for a test's
// import.
type Opened = { url: string; protocols: unknown };
const scope = globalThis as { __opened_websockets__?: Opened[] };

if (!scope.__opened_websockets__) {
  const opened: Opened[] = (scope.__opened_websockets__ = []);
  globalThis.WebSocket = new Proxy(globalThis.WebSocket, {
    construct(target, args: ConstructorParameters<typeof WebSocket>, newTarget) {
      opened.push({ url: String(args[0]), protocols: args[1] });
      return Reflect.construct(target, args, newTarget);
    },
  });
}

export const openedWebSockets = scope.__opened_websockets__;
