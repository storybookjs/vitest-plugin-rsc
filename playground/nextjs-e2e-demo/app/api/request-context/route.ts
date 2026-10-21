import { currentRequest, enterRequest, handle } from "request-context";
import type { NextRequest } from "next/server";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The request as a package keeps it, in an `AsyncLocalStorage` of its own
// from `async_hooks`: see request-context.test.ts.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (request.nextUrl.searchParams.has("enter-with")) {
    // Leaves the store entered once the request is over.
    enterRequest(id);
    return Response.json({ id: currentRequest() ?? null });
  }
  // As React starts a render: in the store, for work that goes on after it.
  handle(id, () => {});
  await delay(1);
  return Response.json({ id: currentRequest() ?? null });
}
