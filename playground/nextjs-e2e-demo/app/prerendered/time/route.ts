import { cookies } from "next/headers";

// A route handler that `revalidate` lets `next build` prerender, and that
// reads the request: its prerender bails out, and the build keeps it dynamic.
export const revalidate = 60;

export async function GET() {
  const theme = (await cookies()).get("theme")?.value ?? "none";
  return Response.json({ theme, random: Math.random() });
}
