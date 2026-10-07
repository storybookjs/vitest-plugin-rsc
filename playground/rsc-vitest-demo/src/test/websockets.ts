// The first setup file: records the websockets the tab opens from here on,
// for client-counter/vite-client.test.tsx. The list is on the global: the tab
// gets this module once as a setup file and once more for a test's import.
const scope = globalThis as { __opened_websockets__?: URL[] };

if (!scope.__opened_websockets__) {
  const opened: URL[] = (scope.__opened_websockets__ = []);
  globalThis.WebSocket = new Proxy(globalThis.WebSocket, {
    construct(target, args: ConstructorParameters<typeof WebSocket>, newTarget) {
      opened.push(new URL(args[0]));
      return Reflect.construct(target, args, newTarget);
    },
  });
}

export const openedWebSockets = scope.__opened_websockets__;
