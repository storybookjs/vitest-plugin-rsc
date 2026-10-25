// What vitest-plugin-rsc tells the window of the page as the page hears that
// the dev server changed modules of an environment: see utils.ts.
const modulesChangedEvent = "vitest-plugin-rsc:react-client:modules-changed";

type ModulesChanged = { environment: string; version: number };

/**
 * Tells the dev server that a file of the app has changed, and to what, if
 * `content` says so: see file-change-service.ts. Resolves once the page has
 * heard of it from the dev server, which the request here does not wait for:
 * as after a change that the watcher sees, the page hears of it on its own
 * socket. The page opens that as it loads its first page.
 */
export async function fileChanged(file: string, content?: string): Promise<void> {
  const heard = new Map<string, number>();
  let waiting: ((event?: Event) => void) | undefined;
  const listener = (event: Event) => {
    const { environment, version } = (event as CustomEvent<ModulesChanged>).detail;
    heard.set(environment, Math.max(heard.get(environment) ?? 0, version));
    waiting?.();
  };
  addEventListener(modulesChangedEvent, listener);
  try {
    const query = new URLSearchParams({ file, ...(content === undefined ? {} : { content }) });
    const response = await fetch(`/service/file-change?${query}`);
    const { versions } = (await response.json()) as { versions: Record<string, number> };
    const pending = () =>
      Object.entries(versions).some(
        ([environment, version]) => (heard.get(environment) ?? 0) < version,
      );
    await new Promise<void>((resolve) => {
      waiting = () => {
        if (!pending()) resolve();
      };
      waiting();
    });
  } finally {
    removeEventListener(modulesChangedEvent, listener);
  }
}
