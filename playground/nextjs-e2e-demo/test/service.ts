// The requests the service in vitest.config.ts has had for a key, this one
// included.
export async function requestHits(key: string): Promise<number> {
  const response = await fetch(`/service/hits?key=${key}`);
  const { hits } = (await response.json()) as { hits: number };
  return hits;
}

// Tells the dev server in vitest.config.ts that a file of the app has changed,
// and to what, if `content` says so.
export async function fileChanged(file: string, content?: string): Promise<void> {
  const query = new URLSearchParams({ file, ...(content === undefined ? {} : { content }) });
  await fetch(`/service/file-change?${query}`);
}

// How often the dev server in vitest.config.ts compiled a file as a module, by
// its path under the root of the app.
export async function transformsOf(file: string): Promise<number> {
  const response = await fetch(`/service/transforms?file=${file}`);
  const { transforms } = (await response.json()) as { transforms: number };
  return transforms;
}
