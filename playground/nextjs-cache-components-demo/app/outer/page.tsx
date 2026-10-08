import { cacheTag } from "next/cache";
import { connection } from "next/server";
import { Suspense } from "react";

let outerRuns = 0;
let innerRuns = 0;

async function Inner() {
  "use cache";
  cacheTag("inner");
  return <span>inner {++innerRuns}</span>;
}

// A cached component that renders another one. Next adds the tags of the
// inner entry to the outer one.
async function Outer() {
  "use cache";
  cacheTag("outer");
  return (
    <p>
      outer {++outerRuns} <Inner />
    </p>
  );
}

// Rendered for each request, also by `next start`, which would prerender it.
async function Dynamic() {
  await connection();
  return <Outer />;
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Dynamic />
    </Suspense>
  );
}
