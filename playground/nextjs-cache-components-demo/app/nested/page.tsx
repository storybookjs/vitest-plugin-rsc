import { cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { Suspense } from "react";

// A component that a cached component renders. In a deployment it is in the
// scope of that cached component: `cookies()` throws there, and `cacheTag()`
// works.
async function Child() {
  const name = (await cookies()).get("name")?.value;
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

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Cached />
    </Suspense>
  );
}
