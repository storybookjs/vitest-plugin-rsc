import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

export function POST(request: NextRequest) {
  const tag = request.nextUrl.searchParams.get("tag");
  if (tag) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: true });
}
