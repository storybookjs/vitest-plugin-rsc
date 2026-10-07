// The page of every route under `app/fixtures`. Those routes are there for the
// probe tests in this directory: a test renders its probe where this page is,
// with `renderServer(<Probe />, { url })`, inside a real route of the app.
export function FixturePage() {
  return <p>Fixture page</p>;
}
