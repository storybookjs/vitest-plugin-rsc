import { headers } from "next/headers";
import { Counter } from "./counter.tsx";

// A Server Component that reads the request, with a Client Component in it.
export async function Greeting({ name }: { name: string }) {
  const agent = (await headers()).get("user-agent") ?? "";
  return (
    <section>
      <h2>Hello from {name}</h2>
      <p>{agent ? "The server read the request." : "No request."}</p>
      <Counter />
    </section>
  );
}
