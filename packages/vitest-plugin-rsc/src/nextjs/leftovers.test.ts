import { expect, test, vi } from "vitest";
import { recordListeners } from "./leftovers.ts";

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
