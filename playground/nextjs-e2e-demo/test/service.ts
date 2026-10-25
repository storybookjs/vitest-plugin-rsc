// The requests the service in vitest.config.ts has had for a key, this one
// included.
export async function requestHits(key: string): Promise<number> {
  const response = await fetch(`/service/hits?key=${key}`);
  const { hits } = (await response.json()) as { hits: number };
  return hits;
}

// Tells the dev server that a file of the app has changed: see the file.
export { fileChanged } from "../../test-helpers/file-changed.ts";

// How often the dev server in vitest.config.ts compiled a file as a module, by
// its path under the root of the app.
export async function transformsOf(file: string): Promise<number> {
  const response = await fetch(`/service/transforms?file=${file}`);
  const { transforms } = (await response.json()) as { transforms: number };
  return transforms;
}

// Lets the service in vitest.config.ts answer the late stylesheet of a key.
export async function releaseStylesheet(key: string): Promise<void> {
  await fetch(`/service/late-stylesheet/release?key=${key}`);
}
