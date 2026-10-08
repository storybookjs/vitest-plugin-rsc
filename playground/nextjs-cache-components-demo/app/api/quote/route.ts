import type { NextRequest } from "next/server";
import { getQuote } from "../../lib/quotes.ts";

export async function GET(request: NextRequest) {
  return Response.json(await getQuote(request.nextUrl.searchParams.get("topic") ?? ""));
}
