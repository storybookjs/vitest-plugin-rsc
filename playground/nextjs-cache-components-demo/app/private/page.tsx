import { cookies } from "next/headers";
import { Suspense } from "react";

let runs = 0;

// A private cache may read the request, and keys its entry by what it read.
async function getGreeting() {
  "use cache: private";
  const name = (await cookies()).get("name")?.value ?? "stranger";
  return `Hello ${name}, ${++runs}`;
}

async function Greeting() {
  return <h1>{await getGreeting()}</h1>;
}

export default function Private() {
  return (
    <Suspense fallback={<p>Loading the greeting</p>}>
      <Greeting />
    </Suspense>
  );
}
