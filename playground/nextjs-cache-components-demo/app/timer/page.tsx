import { cacheTag } from "next/cache";

// What a callback of a timer reads in a cached function.
async function tagInTimer() {
  "use cache";
  return new Promise<string>((resolve) =>
    setTimeout(() => {
      try {
        cacheTag("timer");
        resolve("tagged");
      } catch {
        resolve("cacheTag() throws");
      }
    }, 1),
  );
}

export default async function Timer() {
  return <h1>{await tagInTimer()}</h1>;
}
