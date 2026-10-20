import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, onTestFinished, test, vi } from "vitest";

// What React and Next leave behind as a page loads goes with the page: see
// leftovers.ts of the plugin. A port that stays open with a handler keeps
// its page, and runs the work its page queued in the next one.

test("closes the ports of the message channels that a page opened, once it is left", async () => {
  // Under the plugin's own recording, which a page load puts in front.
  const Native = globalThis.MessageChannel;
  const opened: MessageChannel[] = [];
  globalThis.MessageChannel = class MessageChannel extends Native {
    constructor() {
      super();
      opened.push(this);
    }
  };
  onTestFinished(() => {
    globalThis.MessageChannel = Native;
  });
  const close = vi.spyOn(MessagePort.prototype, "close");
  const closed = () => close.mock.contexts as unknown[];

  const { unmount } = await renderServer({ url: "/" });
  globalThis.MessageChannel = Native;
  // React's scheduler, at least.
  expect(opened.length).toBeGreaterThan(0);
  const ports = opened.flatMap(({ port1, port2 }) => [port1, port2]);
  expect(ports.filter((port) => closed().includes(port))).toEqual([]);

  await unmount();

  expect(ports.filter((port) => !closed().includes(port))).toEqual([]);
});
