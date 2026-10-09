import { fileURLToPath } from "node:url";
import { createProject } from "../../test-helpers/host.ts";

// The app as the CLIs of Vite and Storybook start it: see
// playground/test-helpers, which the notes demo shares.

export const root = fileURLToPath(new URL("../", import.meta.url));

export const { run, serve } = createProject(root);

export { serveFiles, test, type PageErrors, type Site } from "../../test-helpers/host.ts";
