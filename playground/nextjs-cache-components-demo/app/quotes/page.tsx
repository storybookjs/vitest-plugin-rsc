import { cookies } from "next/headers";
import { Suspense } from "react";
import { refreshQuotes } from "../lib/actions.ts";
import { getQuote } from "../lib/quotes.ts";

// The part of the page that reads the request: it has to be behind a
// Suspense boundary with Cache Components.
async function Visitor() {
  const name = (await cookies()).get("name")?.value ?? "stranger";
  return <p>Hello {name}</p>;
}

export default async function Quotes() {
  const quote = await getQuote("tabs");
  return (
    <>
      <h1>
        Quote {quote.runs} about {quote.topic}
      </h1>
      <Suspense fallback={<p>Loading the visitor</p>}>
        <Visitor />
      </Suspense>
      <form action={refreshQuotes}>
        <button>Refresh</button>
      </form>
    </>
  );
}
