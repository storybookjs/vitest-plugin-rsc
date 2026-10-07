import { headers } from "next/headers";

// The service counts the requests it gets for a key. See vitest.config.ts.
async function getHits(url: string): Promise<number> {
  const response = await fetch(url, { cache: "force-cache", next: { tags: ["hits"] } });
  const { hits } = (await response.json()) as { hits: number };
  return hits;
}

export default async function HitsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const url = `http://${(await headers()).get("host")}/service/hits?key=${key}`;
  const first = await getHits(url);
  const second = await getHits(url);
  return (
    <>
      <h1>Hits</h1>
      <p>
        Hits: {first} and {second}
      </p>
    </>
  );
}
