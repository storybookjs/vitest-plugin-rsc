import { cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";

// A component that a cached component renders. In a deployment it is in the
// scope of that cached component: `cookies()` throws there, and `cacheTag()`
// works.
async function Child() {
  let name;
  try {
    name = (await cookies()).get("name")?.value;
  } catch {
    name = "nobody, cookies() throws";
  }
  let tagged = "tagged";
  try {
    cacheTag("child");
  } catch {
    tagged = "not tagged";
  }
  return (
    <p>
      Child of {name}, {tagged}
    </p>
  );
}

async function Cached() {
  "use cache";
  return <Child />;
}

// Rendered for each request, also by `next start`, which would prerender it.
async function Dynamic() {
  await connection();
  return <Cached />;
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Dynamic />
    </Suspense>
  );
}
