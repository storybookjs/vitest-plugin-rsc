import { defineConfig } from "oxfmt";

export default defineConfig({
  // Release Please writes the changelogs, in its own Markdown, and adds to
  // them in every release pull request.
  ignorePatterns: ["packages/*/CHANGELOG.md"],
});
