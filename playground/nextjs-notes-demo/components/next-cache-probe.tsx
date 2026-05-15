import {
  cacheLife,
  cacheTag,
  refresh,
  revalidatePath,
  revalidateTag,
  unstable_cache,
  unstable_noStore,
  updateTag,
} from "next/cache";
import { cookies } from "next/headers";
import { getCacheHandlerEntries } from "next/dist/server/use-cache/handlers.js";
import {
  nextCacheProbeFetchUrl,
  nextCacheProbeNoStoreFetchUrl,
  resetNextCacheProbeFetch,
} from "./next-cache-msw";

const dataTag = "next-cache-probe:data";
const fetchTag = "next-cache-probe:fetch";

let dataVersion = 0;
let renderVersion = 0;
let actionWriteVersion = 0;
let cacheLabel = "default";
let useCacheGeneration = 0;
let useCacheReads = 0;
let remoteUseCacheReads = 0;
let cacheLifeReads = 0;

const readCachedData = unstable_cache(
  async () => {
    dataVersion += 1;
    return `${cacheLabel} data ${dataVersion}`;
  },
  ["next-cache-probe-data"],
  { tags: [dataTag] },
);

export function resetNextCacheProbe(label = "default") {
  dataVersion = 0;
  renderVersion = 0;
  actionWriteVersion = 0;
  cacheLabel = label;
  useCacheGeneration += 1;
  useCacheReads = 0;
  remoteUseCacheReads = 0;
  cacheLifeReads = 0;
  resetNextCacheProbeFetch(label);
}

export function NextNoStoreProbe() {
  unstable_noStore();
  return <p>unstable noStore called</p>;
}

export function NextCacheHandlerProbe() {
  const kinds = Array.from(getCacheHandlerEntries() ?? [])
    .map(([kind]) => kind)
    .join(", ");

  return <p>cache handlers: {kinds || "none"}</p>;
}

export async function NextUseCacheProbe() {
  const first = await readUseCacheValue(useCacheGeneration);
  const second = await readUseCacheValue(useCacheGeneration);
  const remoteFirst = await readRemoteUseCacheValue(useCacheGeneration);
  const remoteSecond = await readRemoteUseCacheValue(useCacheGeneration);
  const cacheLifeFirst = await readCacheLifeValue(useCacheGeneration);
  const cacheLifeSecond = await readCacheLifeValue(useCacheGeneration);
  const privateValue = await readPrivateUseCacheCookie();

  return (
    <section>
      <p>use cache first: {first}</p>
      <p>use cache second: {second}</p>
      <p>use cache reads: {useCacheReads}</p>
      <p>use cache remote first: {remoteFirst}</p>
      <p>use cache remote second: {remoteSecond}</p>
      <p>use cache remote reads: {remoteUseCacheReads}</p>
      <p>use cache life first: {cacheLifeFirst}</p>
      <p>use cache life second: {cacheLifeSecond}</p>
      <p>use cache life reads: {cacheLifeReads}</p>
      <p>use cache private cookie: {privateValue}</p>
    </section>
  );
}

export async function NextUseCacheDynamicApiProbe() {
  const value = await readPublicUseCacheCookie();
  return <p>public use cache cookie: {value}</p>;
}

async function readUseCacheValue(generation: number) {
  "use cache";

  cacheTag(`next-use-cache-probe:${generation}`);
  useCacheReads += 1;
  return `generation ${generation} read ${useCacheReads}`;
}

async function readRemoteUseCacheValue(generation: number) {
  "use cache: remote";

  remoteUseCacheReads += 1;
  return `generation ${generation} remote read ${remoteUseCacheReads}`;
}

async function readCacheLifeValue(generation: number) {
  "use cache";

  cacheLife("notes-demo-fast");
  cacheLifeReads += 1;
  return `generation ${generation} cache life read ${cacheLifeReads}`;
}

async function readPrivateUseCacheCookie() {
  "use cache: private";

  const cookieStore = await cookies();
  return cookieStore.get("next-private-cache")?.value ?? "missing";
}

async function readPublicUseCacheCookie() {
  "use cache";

  const cookieStore = await cookies();
  return cookieStore.get("next-public-cache")?.value ?? "missing";
}

export async function NextCacheProbe() {
  renderVersion += 1;
  const [cachedData, cachedFetch, cachedFetchDuplicate] = await Promise.all([
    readCachedData(),
    fetch(nextCacheProbeFetchUrl, {
      cache: "force-cache",
      next: { tags: [fetchTag] },
    }).then((response) => response.text()),
    fetch(nextCacheProbeFetchUrl, {
      cache: "force-cache",
      next: { tags: [fetchTag] },
    }).then((response) => response.text()),
  ]);
  const noStoreFetch = await fetch(nextCacheProbeNoStoreFetchUrl, { cache: "no-store" }).then(
    (response) => response.text(),
  );
  const noStoreFetchDuplicate = await fetch(nextCacheProbeNoStoreFetchUrl, {
    cache: "no-store",
  }).then((response) => response.text());

  return (
    <section>
      <p>render: {renderVersion}</p>
      <p>action writes: {actionWriteVersion}</p>
      <p>cached data: {cachedData}</p>
      <p>cached fetch: {cachedFetch}</p>
      <p>cached fetch duplicate: {cachedFetchDuplicate}</p>
      <p>no-store fetch: {noStoreFetch}</p>
      <p>no-store fetch duplicate: {noStoreFetchDuplicate}</p>
      <form
        action={async () => {
          "use server";
          actionWriteVersion += 1;
        }}
      >
        <button>Write without refresh</button>
      </form>
      <form
        action={async () => {
          "use server";
          actionWriteVersion += 1;
          refresh();
        }}
      >
        <button>Write and refresh</button>
      </form>
      <form
        action={async () => {
          "use server";
          refresh();
        }}
      >
        <button>Refresh</button>
      </form>
      <form
        action={async () => {
          "use server";
          updateTag(dataTag);
        }}
      >
        <button>Update data tag</button>
      </form>
      <form
        action={async () => {
          "use server";
          updateTag(fetchTag);
        }}
      >
        <button>Update fetch tag</button>
      </form>
      <form
        action={async () => {
          "use server";
          revalidateTag(dataTag, "max");
        }}
      >
        <button>Revalidate data tag</button>
      </form>
      <form
        action={async () => {
          "use server";
          revalidateTag(dataTag, { expire: 0 });
        }}
      >
        <button>Expire data tag</button>
      </form>
      <form
        action={async () => {
          "use server";
          actionWriteVersion += 1;
          revalidatePath("/next-cache-probe", "page");
        }}
      >
        <button>Revalidate current path</button>
      </form>
      <form
        action={async () => {
          "use server";
          updateTag(dataTag);
          updateTag(fetchTag);
        }}
      >
        <button>Update both tags</button>
      </form>
    </section>
  );
}
