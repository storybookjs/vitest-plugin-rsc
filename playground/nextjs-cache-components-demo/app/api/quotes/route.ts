import type { NextRequest } from "next/server";
import { getQuote } from "../../lib/quotes.ts";

// Every topic of `?topics=a,b`. The function is called with what `map()`
// passes on top of the topic: its index, and all of the topics.
export async function GET(request: NextRequest) {
  const topics = (request.nextUrl.searchParams.get("topics") ?? "").split(",");
  return Response.json(await Promise.all(topics.map(getQuote)));
}
