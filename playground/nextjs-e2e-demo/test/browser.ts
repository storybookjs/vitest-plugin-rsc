// A helper of the tests that works on the page: it has to see the browser it
// runs in. It is not a test file or a setup file, so `browserModules` in
// vitest.config.ts says so. Without that it is server code, like every other
// module here, and has no `document`.
export function signInAs(user: string): void {
  document.cookie = `session=${user}; path=/`;
}

export function whereAmI(): string {
  return typeof window === "undefined" ? "server" : "browser";
}
