import { handleRequest, renderServer } from "vitest-plugin-rsc/next";
import { Suspense } from "react";
import { afterAll, afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { spikeStats } from "../../../packages/vitest-plugin-rsc/src/async-local-storage.ts";
import { page } from "vitest/browser";
import { signInAs } from "../test/browser.ts";
import {
  cached,
  CachedParent,
  getA,
  getB,
  getDefault,
  getHits,
  getLate,
  getLife,
  getOuter,
  getPrivate,
  getPublicCookie,
  getRemote,
  getViaHelper,
  getViaTimer,
  readClosure,
  Shell,
  Viewer,
} from "./lib/cached.tsx";

// SPIKE (research/use-cache-spike): what `"use cache"` has to do, as tests.

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
  cached.reads = {};
  cached.duration = 0;
});

afterEach(() => {
  expect(consoleError.mock.calls).toEqual([]);
});

// SPIKE: what the attribution by call stack cost in this file.
afterAll(() => console.log("SPIKE_STATS " + JSON.stringify(spikeStats)));

const revalidate = (tag: string) => handleRequest(`/api/revalidate?tag=${tag}`, { method: "POST" });
const nextMillisecond = () => new Promise((resolve) => setTimeout(resolve, 5));
const url = "/fixtures";

async function Text({ read }: { read: () => Promise<string> }) {
  return <p>{await read()}</p>;
}

// Renders a value twice in one request and once more in the next.
async function expectCached(read: () => Promise<string>, first: string | RegExp, name: string) {
  await renderServer(
    <>
      <Text read={read} />
      <Text read={read} />
    </>,
    { url },
  );
  await expect.element(page.getByText(first).first()).toBeVisible();
  expect(page.getByText(first).elements()).toHaveLength(2);
  await renderServer(<Text read={read} />, { url });
  await expect.element(page.getByText(first)).toBeVisible();
  expect(cached.reads[name]).toBe(1);
}

test("default: computes once, for this request and the next", async () => {
  await expectCached(() => getDefault("x"), "default x 1", "default");
});

test("remote", async () => {
  await expectCached(() => getRemote("x"), "remote x 1", "remote");
});

test("private: reads the cookies of the request", async () => {
  signInAs("ada");
  await renderServer(<Text read={getPrivate} />, { url });
  await expect.element(page.getByText("private ada 1")).toBeVisible();
});

test("cacheLife", async () => {
  await expectCached(() => getLife("x"), "life x 1", "life");
});

test("cacheTag and revalidateTag", async () => {
  await renderServer(<Text read={() => getDefault("x")} />, { url });
  await expect.element(page.getByText("default x 1")).toBeVisible();
  await nextMillisecond();
  await revalidate("default-tag");
  await renderServer(<Text read={() => getDefault("x")} />, { url });
  await expect.element(page.getByText("default x 2")).toBeVisible();
});

test("closures: what a cached function closes over is part of its key", async () => {
  await renderServer(<Text read={() => readClosure("scope")} />, { url });
  await expect
    .element(page.getByText("scope same 1 | scope same 1 | scope different 2"))
    .toBeVisible();
});

test("own await: cacheTag after the function has awaited", async () => {
  await renderServer(<Text read={() => getLate("x")} />, { url });
  await expect.element(page.getByText("late x 1")).toBeVisible();
  await nextMillisecond();
  await revalidate("late-tag");
  await renderServer(<Text read={() => getLate("x")} />, { url });
  await expect.element(page.getByText("late x 2")).toBeVisible();
});

test("concurrent: two cached functions side by side keep their own tags", async () => {
  const both = (
    <>
      <Text read={() => getA("x")} />
      <Text read={() => getB("x")} />
    </>
  );
  await renderServer(both, { url });
  await expect.element(page.getByText("a x 1")).toBeVisible();
  await expect.element(page.getByText("b x 1")).toBeVisible();
  await nextMillisecond();
  await revalidate("tag-a");
  await renderServer(both, { url });
  await expect.element(page.getByText("a x 2")).toBeVisible();
  await expect.element(page.getByText("b x 1")).toBeVisible();
});

test("next to a slow cached function, a component reads the request", async () => {
  signInAs("ada");
  cached.duration = 300;
  await renderServer(
    <>
      <Suspense fallback={<p>Loading</p>}>
        <Text read={() => getLate("slow")} />
      </Suspense>
      <Suspense fallback={<p>Loading viewer</p>}>
        <Slow ms={150}>
          <Viewer />
        </Slow>
      </Suspense>
    </>,
    { url },
  );
  await expect.element(page.getByText("Viewed by ada")).toBeVisible();
  await expect.element(page.getByText("late slow 1")).toBeVisible();
});

async function Slow({ ms, children }: { ms: number; children: React.ReactNode }) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return children;
}

// Renders what a cached function throws, as its caller gets it.
async function Caught({ read }: { read: () => Promise<string> }) {
  try {
    return <p>read {await read()}</p>;
  } catch (error) {
    return <p>threw {(error as Error).message}</p>;
  }
}

test("a public cache rejects cookies(), also after an await", async () => {
  consoleError.mockImplementation(() => {});
  signInAs("ada");
  await renderServer(<Caught read={getPublicCookie} />, { url });
  await expect.element(page.getByText(/^(threw|read) /)).toBeVisible();
  consoleError.mockClear();
  await expect.element(page.getByText(/threw .*cookies\(\)/)).toBeVisible();
});

test("callee await: a helper that awaits and then tags", async () => {
  await renderServer(<Text read={() => getViaHelper("x")} />, { url });
  await expect.element(page.getByText("helper x 1")).toBeVisible();
  await nextMillisecond();
  await revalidate("helper-tag");
  await renderServer(<Text read={() => getViaHelper("x")} />, { url });
  await expect.element(page.getByText("helper x 2")).toBeVisible();
});

test("callee await: the tag of a fetch in a helper is a tag of the entry", async () => {
  const read = () => getHits(window.location.origin);
  await renderServer(<Text read={read} />, { url });
  await expect.element(page.getByText(/hits \d+ 1/)).toBeVisible();
  await nextMillisecond();
  await revalidate("fetch-tag");
  await renderServer(<Text read={read} />, { url });
  await expect.element(page.getByText(/hits \d+ 2/)).toBeVisible();
});

test("callback: cacheTag in a timer callback", async () => {
  await renderServer(<Text read={() => getViaTimer("x")} />, { url });
  await expect.element(page.getByText("timer x 1")).toBeVisible();
});

test("nested: the tag of an inner cached function expires the outer one", async () => {
  await renderServer(<Text read={getOuter} />, { url });
  await expect.element(page.getByText("outer 1 with inner 1")).toBeVisible();
  await nextMillisecond();
  await revalidate("inner-tag");
  await renderServer(<Text read={getOuter} />, { url });
  await expect.element(page.getByText("outer 2 with inner 2")).toBeVisible();
});

test("cached component with children: the shell is kept, the children are not", async () => {
  await renderServer(
    <Shell title="News">
      <p>first</p>
    </Shell>,
    { url },
  );
  await expect.element(page.getByText("News shell 1")).toBeVisible();
  await expect.element(page.getByText("first")).toBeVisible();
  await renderServer(
    <Shell title="News">
      <p>second</p>
    </Shell>,
    { url },
  );
  await expect.element(page.getByText("News shell 1")).toBeVisible();
  await expect.element(page.getByText("second")).toBeVisible();
});

test("child of a cached component: cacheTag in a component it renders", async () => {
  await renderServer(<CachedParent />, { url });
  await expect.element(page.getByText("parent 1")).toBeVisible();
  await expect.element(page.getByText("child 1", { exact: true })).toBeVisible();
  await nextMillisecond();
  await revalidate("child-tag");
  await renderServer(<CachedParent />, { url });
  await expect.element(page.getByText("parent 2")).toBeVisible();
});

test("child of a cached component: cacheTag after the child has awaited", async () => {
  await renderServer(<CachedParent late />, { url });
  await expect.element(page.getByText("parent 1")).toBeVisible();
  await expect.element(page.getByText("late child 1")).toBeVisible();
});

test("outside a request a cached function has no cache: Next says so", async () => {
  await expect(getDefault("direct")).rejects.toThrow(/cannot be used outside of App Router/);
});
