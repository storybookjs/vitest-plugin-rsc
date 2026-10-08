import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Slow" };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function Report() {
  await wait(600);
  return <p>Report: ready</p>;
}

// Waits for data twice: the page behind `loading.tsx`, and a part of it
// behind a boundary of its own.
export default async function SlowPage() {
  await wait(600);
  return (
    <>
      <h1>Slow</h1>
      <Suspense fallback={<p>Loading the report…</p>}>
        <Report />
      </Suspense>
    </>
  );
}
