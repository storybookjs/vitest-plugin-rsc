import { revalidatePath, revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

// What a webhook does when data has changed: `?tag=reports` or `?path=/hits`.
// With `&profile=max` the next reader still gets what is cached, and Next
// computes it again in the background. Without, a tag expires right away.
export function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tag = searchParams.get("tag");
  const path = searchParams.get("path");
  if (tag) revalidateTag(tag, searchParams.get("profile") ?? { expire: 0 });
  if (path) revalidatePath(path);
  return Response.json({ revalidated: true });
}
