import { ssrLayer } from "./server-layers.ts";

// The last setup file of `vitestPluginNext()`, after the project's own: the
// test file waits here for the server layers, which the entry starts to load
// as setup.ts imports it, so that they load while the project's setup files
// run, like a database that starts in the page. With a dev server, the first
// time the ssr layer loads compiles Next's server, which takes longer than a
// test may; in a setup file it does not count towards a test's timeout. A
// layer that fails to load fails the test file here.
await ssrLayer();
