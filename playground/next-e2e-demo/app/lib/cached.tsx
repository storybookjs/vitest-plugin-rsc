import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

// SPIKE (research/use-cache-spike): functions and components with `"use cache"`.

// What a test sets and reads: how often each function ran, and how long the
// slow ones take.
export const cached = { reads: {} as Record<string, number>, duration: 0 };

const count = (name: string) => (cached.reads[name] = (cached.reads[name] ?? 0) + 1);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getDefault(key: string) {
  "use cache";
  cacheTag("default-tag");
  return `default ${key} ${count("default")}`;
}

export async function getRemote(key: string) {
  "use cache: remote";
  return `remote ${key} ${count("remote")}`;
}

export async function getPrivate() {
  "use cache: private";
  const store = await cookies();
  return `private ${store.get("session")?.value} ${count("private")}`;
}

export async function getLife(key: string) {
  "use cache";
  cacheLife("seconds");
  return `life ${key} ${count("life")}`;
}

// Tags itself after it has awaited: its own `await`.
export async function getLate(key: string) {
  "use cache";
  await delay(cached.duration);
  cacheTag("late-tag");
  cacheLife("hours");
  return `late ${key} ${count("late")}`;
}

export async function readClosure(scope: string) {
  async function inner(label: string) {
    "use cache";
    return `${scope} ${label} ${count("closure")}`;
  }
  return [await inner("same"), await inner("same"), await inner("different")].join(" | ");
}

// Two that run side by side, each with a tag of its own between two awaits.
export async function getA(key: string) {
  "use cache";
  await delay(20);
  cacheTag("tag-a");
  await delay(20);
  return `a ${key} ${count("a")}`;
}

export async function getB(key: string) {
  "use cache";
  await delay(10);
  cacheTag("tag-b");
  await delay(30);
  return `b ${key} ${count("b")}`;
}

// Reads the request in a public cache, after an await. Next throws.
export async function getPublicCookie() {
  "use cache";
  await delay(1);
  const store = await cookies();
  return store.get("session")?.value ?? "none";
}

// A helper that awaits and then tags: an `await` of a callee.
async function tagLater(tag: string) {
  await delay(5);
  cacheTag(tag);
}

export async function getViaHelper(key: string) {
  "use cache";
  await tagLater("helper-tag");
  return `helper ${key} ${count("helper")}`;
}

// A callee that fetches with a tag after it has awaited.
async function loadHits(origin: string): Promise<number> {
  await delay(5);
  const response = await fetch(`${origin}/service/hits?key=use-cache`, {
    next: { tags: ["fetch-tag"] },
  });
  return ((await response.json()) as { hits: number }).hits;
}

export async function getHits(origin: string) {
  "use cache";
  return `hits ${await loadHits(origin)} ${count("hits")}`;
}

// Tags from a callback that no async function awaits.
export async function getViaTimer(key: string) {
  "use cache";
  await new Promise<void>((resolve, reject) =>
    setTimeout(() => {
      try {
        cacheTag("timer-tag");
        resolve();
      } catch (error) {
        reject(error as Error);
      }
    }, 5),
  );
  return `timer ${key} ${count("timer")}`;
}

// A cached component that keeps its shell and takes its children as they are.
export async function Shell({ title, children }: { title: string; children: ReactNode }) {
  "use cache";
  return (
    <section aria-label={title}>
      <h2>
        {title} shell {count("shell")}
      </h2>
      {children}
    </section>
  );
}

// A component that a cached component renders: React calls it, later.
function TaggedChild() {
  cacheTag("child-tag");
  return <p>child {count("child")}</p>;
}

async function LateChild() {
  await delay(5);
  cacheTag("late-child-tag");
  return <p>late child {count("late-child")}</p>;
}

export async function CachedParent({ late = false }: { late?: boolean }) {
  "use cache";
  return (
    <div>
      <p>parent {count("parent")}</p>
      {late ? <LateChild /> : <TaggedChild />}
    </div>
  );
}

// A cached function in a cached function: the tag of the inner one is a tag
// of the outer one too.
export async function getInner() {
  "use cache";
  cacheTag("inner-tag");
  return `inner ${count("inner")}`;
}

export async function getOuter() {
  "use cache";
  await delay(5);
  return `outer ${count("outer")} with ${await getInner()}`;
}

export async function Viewer() {
  const store = await cookies();
  return <p>Viewed by {store.get("session")?.value ?? "nobody"}</p>;
}
