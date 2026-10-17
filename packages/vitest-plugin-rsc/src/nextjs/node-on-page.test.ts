import { expect, test, vi } from "vitest";
import { NodeOnPage } from "./node-on-page.ts";

// What a page does in a commit: React reports the errors it caught, and runs
// the layout effects. Then the microtasks, and then the passive effects.
const nextTask = () => new Promise((resolve) => setTimeout(resolve));

// A node that the page shows, at its first version.
function shownNode() {
  const node = new NodeOnPage();
  const refresh = vi.fn();
  node.mounted(refresh);
  node.committed(0);
  node.shown();
  return { node, refresh };
}

const settled = async (promise: Promise<unknown>) => {
  let outcome: unknown = "pending";
  promise.then(
    () => (outcome = "resolved"),
    (error: unknown) => (outcome = error),
  );
  await nextTask();
  return outcome;
};

test("swaps the node, asks the router for it, and resolves once the page has committed it", async () => {
  const { node, refresh } = shownNode();
  const swap = vi.fn();

  const rendering = node.rerender(swap);

  expect(swap).toHaveBeenCalledWith(1);
  expect(refresh).toHaveBeenCalledOnce();
  expect(await settled(rendering)).toBe("pending");
  node.committed(0);
  expect(await settled(rendering)).toBe("pending");
  node.committed(1);
  expect(await settled(rendering)).toBe("resolved");
});

test("asks the router once for every rerender, and resolves them once the page has the last one", async () => {
  const { node, refresh } = shownNode();

  const first = node.rerender(() => {});
  const second = node.rerender(() => {});
  node.committed(2);

  expect(refresh).toHaveBeenCalledTimes(2);
  expect(await settled(first)).toBe("resolved");
  expect(await settled(second)).toBe("resolved");
});

test("asks the router once the node is mounted, when it is still to hydrate", async () => {
  const node = new NodeOnPage();
  const refresh = vi.fn();

  const rendering = node.rerender(() => {});
  node.mounted(refresh);

  expect(refresh).toHaveBeenCalledOnce();
  node.committed(0);
  node.shown();
  expect(await settled(rendering)).toBe("pending");
  node.committed(1);
  expect(await settled(rendering)).toBe("resolved");
});

test("keeps the node that Strict Mode takes down and shows again at once", async () => {
  const { node, refresh } = shownNode();
  const rendering = node.rerender(() => {});

  node.mounted(refresh);
  node.hidden();
  node.shown();
  await nextTask();
  node.committed(1);

  expect(refresh).toHaveBeenCalledOnce();
  expect(await settled(rendering)).toBe("resolved");
});

test("keeps the node that a Suspense fallback hid, and asks the router no more once it is back", async () => {
  const { node, refresh } = shownNode();
  const rendering = node.rerender(() => {});

  // A fallback takes down the layout effects of the node, and not the
  // passive ones: once the node is back, it is mounted again.
  node.mounted(refresh);
  await nextTask();
  node.committed(1);

  expect(refresh).toHaveBeenCalledOnce();
  expect(await settled(rendering)).toBe("resolved");
});

test("rejects once nothing shows the node, and from then on, without swapping it", async () => {
  const { node } = shownNode();
  const rendering = node.rerender(() => {});

  node.hidden();

  const message = /the page has something else there/;
  expect(await settled(rendering)).toEqual(
    expect.objectContaining({ message: expect.stringMatching(message) }),
  );
  const swap = vi.fn();
  await expect(node.rerender(swap)).rejects.toThrow(message);
  expect(swap).not.toHaveBeenCalled();
});

test("rejects with the error that React reported, when a boundary shows it in place of the node", async () => {
  const { node } = shownNode();
  const rendering = node.rerender(() => {});
  const error = new Error("Broken node");

  node.errored(error);
  await nextTask();
  expect(await settled(rendering)).toBe("pending");
  node.hidden();

  expect(await settled(rendering)).toEqual(expect.objectContaining({ cause: error }));
});

test("keeps the node when a boundary in it shows the error", async () => {
  const { node } = shownNode();
  const rendering = node.rerender(() => {});

  node.errored(new Error("Broken widget"));
  await nextTask();
  node.committed(1);

  expect(await settled(rendering)).toBe("resolved");
});

test("keeps the node when a boundary in it shows an error as the node hydrates", async () => {
  const node = new NodeOnPage();
  const refresh = vi.fn();

  // The boundary is in the node, so React reports its error before the node
  // is mounted.
  node.errored(new Error("Broken widget"));
  node.mounted(refresh);
  await nextTask();
  node.committed(0);
  node.shown();

  const rendering = node.rerender(() => {});
  node.committed(1);
  expect(await settled(rendering)).toBe("resolved");
});

test("rejects when an error takes the place of a node that is still to hydrate", async () => {
  const node = new NodeOnPage();
  const rendering = node.rerender(() => {});
  const error = new Error("Broken node");

  node.errored(error);

  expect(await settled(rendering)).toEqual(expect.objectContaining({ cause: error }));
});

test("rejects with an AbortError that names what left the page, and an Error after that", async () => {
  const { node, refresh } = shownNode();
  const rendering = node.rerender(() => {});

  node.left("cleanup()");

  expect(await settled(rendering)).toEqual(
    expect.objectContaining({
      name: "AbortError",
      message: "The page was left before the node had rendered again: by cleanup().",
    }),
  );
  await expect(node.rerender(() => {})).rejects.toThrow(
    "rerender() renders the node again on its page, which cleanup() has left",
  );
  // What the page that was left still tells.
  node.mounted(refresh);
  node.committed(1);
  node.hidden();
  await nextTask();
  expect(refresh).toHaveBeenCalledOnce();
  await expect(node.rerender(() => {})).rejects.toThrow("cleanup() has left");
});
