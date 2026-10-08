import { headers } from "next/headers";

type Options = { key?: string; cache?: RequestCache; revalidate?: string };

// The service counts the requests it gets for a key. See vitest.config.ts.
async function getHits(url: string, { cache, revalidate }: Options): Promise<number> {
  const response = await fetch(url, {
    // Next takes one of the two: how to cache, or for how long.
    ...(revalidate ? {} : { cache: cache ?? "force-cache" }),
    next: { tags: ["hits"], ...(revalidate && { revalidate: Number(revalidate) }) },
  });
  const { hits } = (await response.json()) as { hits: number };
  return hits;
}

export default async function HitsPage({ searchParams }: { searchParams: Promise<Options> }) {
  const options = await searchParams;
  const url = `http://${(await headers()).get("host")}/service/hits?key=${options.key}`;
  const first = await getHits(url, options);
  const second = await getHits(url, options);
  return (
    <>
      <h1>Hits</h1>
      <p>
        Hits: {first} and {second}
      </p>
    </>
  );
}
