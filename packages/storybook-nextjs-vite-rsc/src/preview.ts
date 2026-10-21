// The first of the preview's annotations, before the project's preview,
// which Storybook loads last: the platform of the app's server, with the
// env of the run in `process.env` (vitest-plugin-rsc), before a module that
// the project's preview imports first reads it, like a package that reads
// `process.env.NEXT_PUBLIC_*` as it evaluates. It annotates nothing.
import "vitest-plugin-rsc/nextjs/client-components";
