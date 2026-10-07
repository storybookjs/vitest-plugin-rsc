// Registered by `vitestPluginRSC()` as a setup file, after the project's own.
//
// A `vi.mock()` only asks for the mock: putting it in place is asynchronous.
// Vitest waits for that before a dynamic import, but in browser mode not
// before it imports a test file (since 5.0.0-beta.7, still in 5.0.3). A test file
// without a `vi.mock()` of its own then gets the module of a mock from a
// setup file unmocked. So wait here, after the project's setup files and
// before the test file: Vitest makes any dynamic import wait for the mocks,
// and this one is of a module that is loaded already.
//
// Not with `sequence.setupFiles: "parallel"`: the setup files then run
// together, and this one does not come after the others.
//
// Can go when Vitest waits itself. Reported in
// https://github.com/vitest-dev/vitest/issues/11450, closed by its reporter
// without a fix.
await import("vitest");

export {};
