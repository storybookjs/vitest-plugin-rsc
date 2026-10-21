"use client";

import { expect, inject, test } from "vitest";
import { page } from "vitest/browser";
import { Disabled, Pressed } from "./button.stories.tsx";

// A story is a test too: imported with CSF Next, its `run()` renders it with
// the preview of its file, here the one of a client story, and plays it. A
// test can then ask more of what it rendered. `@storybook/react` renders a
// client story in `act()`, which React's production build does not have.

const inDevelopment = test.skipIf(inject("build") === "production");

inDevelopment("runs the story of a pressed button", async () => {
  await Pressed.run();
  await expect.element(page.getByRole("button", { name: "Create note" })).toBeEnabled();
});

inDevelopment("runs the story of a disabled button", () => Disabled.run());
