import { cookies } from "next/headers";
import { Suspense } from "react";

// What Next does not allow: a cached function that reads the request.
async function getVisitor() {
  "use cache";
  return (await cookies()).get("name")?.value;
}

async function Visitor() {
  try {
    return <p>Visitor: {await getVisitor()}</p>;
  } catch (error) {
    return <p>Not allowed: {(error as Error).message.split("\n")[0]}</p>;
  }
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Visitor />
    </Suspense>
  );
}
