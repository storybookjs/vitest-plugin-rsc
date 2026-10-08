import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runCheck } from "../../scripts/run-check.ts";

const script = fileURLToPath(new URL("./check.ts", import.meta.url));

// One after the other: the builds of a project share its directories.
test("the app runs in a static build", async () => {
  await runCheck(script, "--build");
});

// A script that calls Vite's `build()` with the config file builds one
// environment, and the plugin the other layers around it.
test("the app runs in a build of Vite's build(), from the config file", async () => {
  await runCheck(script, "--build", "--vite-build", "--view=home,node,dynamic,styles");
});

// The checks that are about a file of the build: its fonts, images and CSS.
test("a static build with a relative base runs from a directory of a site", async () => {
  await runCheck(script, "--build", "--base=./", "--view=home,font,image,styles,dynamic");
});
