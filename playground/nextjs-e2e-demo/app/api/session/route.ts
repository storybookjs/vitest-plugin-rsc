import { NextResponse } from "next/server";

// Signs in with a cookie header of its own, not with `response.cookies`.
export function POST() {
  return NextResponse.json({ user: "ada" }, { headers: { "set-cookie": "session=ada; Path=/" } });
}
