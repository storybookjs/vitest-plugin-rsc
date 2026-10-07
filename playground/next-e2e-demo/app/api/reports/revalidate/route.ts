import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

// What a webhook does when the data behind the reports has changed. With
// `?profile=max` the next reader still gets the report there is, and Next
// writes a new one in the background. Without, the reports expire right away.
export function POST(request: NextRequest) {
  const profile = request.nextUrl.searchParams.get("profile");
  revalidateTag("reports", profile ?? { expire: 0 });
  return Response.json({ revalidated: true });
}
