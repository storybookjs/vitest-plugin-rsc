import { headers } from "next/headers";

type Props = { searchParams: Promise<{ ask?: string }> };

// A Server Component that asks its own app: a route handler, or the path in
// `?ask=`.
export default async function StatusPage({ searchParams }: Props) {
  const origin = `http://${(await headers()).get("host")}`;
  const { ask = "/api/echo/status" } = await searchParams;
  const response = await fetch(origin + ask);
  const answer = (await response.json()) as { path?: string[] };
  return (
    <>
      <h1>Status of {answer.path?.join("/")}</h1>
      <p>Answer: {JSON.stringify(answer)}</p>
    </>
  );
}
