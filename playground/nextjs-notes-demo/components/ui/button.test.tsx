"use client";

import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { Disabled, Pressed } from "./button.stories.tsx";

// A story is a test too: imported with CSF Next, its `run()` renders it with
// the preview of its file, here the one of a client story, and plays it. A
// test can then ask more of what it rendered.

test("runs the story of a pressed button", async () => {
  await Pressed.run();
  await expect.element(page.getByRole("button", { name: "Create note" })).toBeEnabled();
});

test("runs the story of a disabled button", () => Disabled.run());
