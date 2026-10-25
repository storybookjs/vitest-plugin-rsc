import { ssrLayer } from "./server-layers.ts";

// The last setup file of `vitestPluginNext()`, after the project's own: the
// test file waits here for the server layers, which the entry starts to load
// as setup.ts imports it, so that they load while the project's setup files
// run, like a database that starts in the page. With a dev server, the first
// time the ssr layer loads compiles Next's server, which takes longer than a
// test may; in a setup file it does not count towards a test's timeout. A
// layer that fails to load fails the test file here.
//
// A `vi.mock()` of a project's setup file registers while the layers load,
// and still reaches every module of the app: the layers import none as they
// load. The routes, the middleware and the cache handlers are behind loaders
// that a request calls (the lists of plugin.ts), and `instrumentation.ts` is
// not run. What the rsc layer, the one that a mock reaches, imports as it
// loads is the plugin's own, Vite RSC's runtime and a module of Next's that
// an app does not import; React it has before the project's setup files.
await ssrLayer();
