import { cacheLife, cacheTag } from "next/cache";

let runs = 0;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A function of the app that the server caches: what it returns is kept for
// the next request, until one of its tags is revalidated.
export async function getQuote(topic: string) {
  "use cache";
  // After an await: the function still has the scope of its cache entry.
  await delay(1);
  cacheTag("quotes", `quote-${topic}`);
  cacheLife("hours");
  return { topic, runs: ++runs, author: await getAuthor(topic.length) };
}

// A cached function inside another one.
async function getAuthor(id: number) {
  "use cache";
  await delay(1);
  cacheTag("authors");
  return `author ${id}`;
}
