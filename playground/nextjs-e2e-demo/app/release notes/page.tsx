import { Suspense } from "react";
import { RouterState } from "../components/router-state.tsx";

// A route with a name that a URL percent-encodes: app/routing.test.tsx.
// `next build` prerenders it, so what reads the search params of the URL is
// in a Suspense boundary, and renders in the browser.
export default function ReleaseNotesPage() {
  return (
    <>
      <h1>Release notes</h1>
      <Suspense>
        <RouterState />
      </Suspense>
    </>
  );
}
