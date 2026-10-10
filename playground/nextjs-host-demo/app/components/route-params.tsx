"use client";

import { useParams, usePathname } from "next/navigation";

// The route that Next's router is at: its params come from the app's route
// for the URL, which a rewrite of the proxy can decide.
export function RouteParams() {
  return (
    <dl>
      <dt>Pathname</dt>
      <dd>{usePathname()}</dd>
      <dt>Params</dt>
      <dd>{JSON.stringify(useParams())}</dd>
    </dl>
  );
}
