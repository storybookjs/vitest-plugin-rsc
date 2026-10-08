import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runCheck } from "../../scripts/run-check.ts";

const script = fileURLToPath(new URL("./check.ts", import.meta.url));
const storybook = fileURLToPath(new URL("./check-storybook.ts", import.meta.url));

// One after the other: the builds of a project share its directories.
test("the app runs in a static build", async () => {
  await runCheck(script, "--build");
});

// The checks that are about a file of the build: its fonts, images and CSS.
test("a static build with a relative base runs from a directory of a site", async () => {
  await runCheck(script, "--build", "--base=./", "--view=home,font,image,styles,dynamic");
});

// Storybook builds with Vite's app builder, and its stories are host files:
// also the ones with `"use client"`, which the build has in its browser layer.
test("the stories run in a static build of Storybook", { timeout: 300_000 }, async () => {
  await runCheck(storybook, "--build");
});
