import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

let innerRuns = 0;
const inner = unstable_cache(async () => ++innerRuns, ["cache-scope-inner"]);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// What a cached function may not do in a deployment: read the request, and
// have a cached function of its own inside it that keeps its result. It
// tries both, either right away or after it has awaited.
const probe = unstable_cache(
  async (when: string) => {
    if (when === "after-await") await delay(1);
    const nested = inner();
    let request = "readable";
    try {
      void cookies();
    } catch {
      request = "not readable";
    }
    return { request, innerRuns: await nested };
  },
  ["cache-scope-probe"],
  { tags: ["cache-scope"] },
);

export async function GET(request: NextRequest) {
  return Response.json(await probe(request.nextUrl.searchParams.get("when") ?? ""));
}
