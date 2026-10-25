/**
 * Tells the dev server that a file of the app has changed, and to what, if
 * `content` says so: see file-change-service.ts. The next page load sees it.
 */
export async function fileChanged(file: string, content?: string): Promise<void> {
  const query = new URLSearchParams({ file, ...(content === undefined ? {} : { content }) });
  // At the origin of the page, which is the dev server's: an app that
  // imports this has it as server code, whose `fetch` is the server's.
  await fetch(`${globalThis.location.origin}/service/file-change?${query}`);
}
