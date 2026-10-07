// A module of the test that is not a test file. It is `testModules` in
// vitest.config.ts that tells it from a module of the app: it needs the tab.
export function signInAs(user: string): void {
  document.cookie = `session=${user}; path=/`;
}

export function whereAmI(): string {
  return typeof window === "undefined" ? "server" : "browser";
}
