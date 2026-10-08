// Helpers of the tests that work on the page. `whereAmI` has to see the
// browser it runs in. This is not a test file or a setup file, so
// `browserModules` in vitest.config.ts says so. Without that it is server
// code, like every other module here, and `typeof window` is "undefined".
export function signInAs(user: string): void {
  document.cookie = `session=${user}; path=/`;
}

export function whereAmI(): string {
  return typeof window === "undefined" ? "server" : "browser";
}
