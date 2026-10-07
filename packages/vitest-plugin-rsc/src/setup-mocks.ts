// Registered by `vitestPluginRSC()` as the last setup file.
//
// A `vi.mock()` only asks for the mock: putting it in place is asynchronous.
// Vitest waits for that before a dynamic import, but in browser mode on
// Vitest 5.0.0-beta.7 to 5.0.3 not before it imports a test file. A test file
// without a `vi.mock()` of its own then gets the module of a mock from a
// setup file unmocked. So wait here, after the project's setup files and
// before the test file: Vitest makes any dynamic import wait for the mocks,
// and this one is of a module that is loaded already.
//
// Can go when Vitest waits itself: https://github.com/vitest-dev/vitest/issues/11450
await import("vitest");

export {};
