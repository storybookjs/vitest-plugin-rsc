import { expect, test, vi } from "vitest";
import { recordListeners, recordMessageChannels } from "./leftovers.ts";

// Long enough for a message that a port would deliver.
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 10));

test("a message posted to a channel after remove() is not delivered", async () => {
  const leftovers = recordMessageChannels();
  const { port1, port2 } = new MessageChannel();
  leftovers.stop();
  const heard = vi.fn();
  port1.onmessage = heard;
  port2.postMessage("while the page is open");
  await vi.waitFor(() => expect(heard).toHaveBeenCalledOnce());

  leftovers.remove();
  port2.postMessage("after the page is left");
  await nextTask();

  expect(heard).toHaveBeenCalledOnce();
});

test("keeps the channels that were opened before or after the recording", async () => {
  const before = new MessageChannel();
  const leftovers = recordMessageChannels();
  leftovers.stop();
  const after = new MessageChannel();
  const heard = vi.fn();
  before.port1.onmessage = heard;
  after.port1.onmessage = heard;

  leftovers.remove();
  before.port2.postMessage("before");
  after.port2.postMessage("after");

  await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(2));
  for (const { port1 } of [before, after]) port1.close();
});

test("removes the listeners that were added while it recorded, and only those", () => {
  const target = new EventTarget();
  const kept = vi.fn();
  target.addEventListener("ping", kept);
  const leftovers = recordListeners(target);
  const removed = vi.fn();
  target.addEventListener("ping", removed);
  leftovers.stop();
  const added = vi.fn();
  target.addEventListener("ping", added);

  leftovers.remove();
  target.dispatchEvent(new Event("ping"));

  expect(removed).not.toHaveBeenCalled();
  expect(kept).toHaveBeenCalledOnce();
  expect(added).toHaveBeenCalledOnce();
});
