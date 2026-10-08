// The requests the service in vitest.config.ts has had for a key, this one
// included.
export async function requestHits(key: string): Promise<number> {
  const response = await fetch(`/service/hits?key=${key}`);
  const { hits } = (await response.json()) as { hits: number };
  return hits;
}
