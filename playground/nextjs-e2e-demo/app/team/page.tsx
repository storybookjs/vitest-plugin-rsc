import { cookies, headers } from "next/headers";

// Behind proxy.ts, which wants a session for it.
export default async function TeamPage() {
  return (
    <>
      <h1>Team</h1>
      <p>Team: {(await headers()).get("x-team") ?? "none"}</p>
      <p>Last team: {(await cookies()).get("last-team")?.value ?? "none"}</p>
    </>
  );
}
