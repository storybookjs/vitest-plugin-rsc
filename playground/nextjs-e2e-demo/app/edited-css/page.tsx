import "./page.css";

// A page with a stylesheet that the tests edit, while a test runs. Rendered
// at every request: in production `next build` would prerender it, and the
// server keep it, links and all, until the test ends.
export const dynamic = "force-dynamic";

export default function EditedCssPage() {
  return <p className="edited">Styled by a stylesheet that is edited</p>;
}
