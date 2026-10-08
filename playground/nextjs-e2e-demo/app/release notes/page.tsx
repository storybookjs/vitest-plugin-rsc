import { RouterState } from "../components/router-state.tsx";

// A route with a name that a URL percent-encodes: app/routing.test.tsx.
export default function ReleaseNotesPage() {
  return (
    <>
      <h1>Release notes</h1>
      <RouterState />
    </>
  );
}
