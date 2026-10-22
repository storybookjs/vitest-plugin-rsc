import { cookies } from "next/headers";
import { Suspense } from "react";

async function Theme() {
  const theme = (await cookies()).get("theme")?.value ?? "none";
  return <span>Theme {theme}</span>;
}

// A page that reads the request in a `<Suspense>` boundary: its prerender
// completes, and the build finds it dynamic afterwards.
export default function SuspensePage() {
  return (
    <p>
      <Suspense fallback="Theme …">
        <Theme />
      </Suspense>
      , rendered as {Math.random()}
    </p>
  );
}
