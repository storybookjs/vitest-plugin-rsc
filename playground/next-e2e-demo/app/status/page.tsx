import { headers } from "next/headers";

// A Server Component that asks a route handler of its own app.
export default async function StatusPage() {
  const origin = `http://${(await headers()).get("host")}`;
  const response = await fetch(`${origin}/api/echo/status`);
  const { path } = (await response.json()) as { path: string[] };
  return <h1>Status of {path.join("/")}</h1>;
}
