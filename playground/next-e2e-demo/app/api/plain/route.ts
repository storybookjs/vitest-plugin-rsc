// A route handler that only uses the platform: no helper of Next.
export function GET() {
  return new Response("plain", { headers: { "set-cookie": "plain=1; Path=/" } });
}
