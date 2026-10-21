import { cookies } from "next/headers";

// Without a Suspense boundary around what reads the request.
export default async function Blocking() {
  const name = (await cookies()).get("name")?.value ?? "stranger";
  return <h1>Hello {name}</h1>;
}
