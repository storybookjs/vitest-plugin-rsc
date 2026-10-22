// A page that `next build` renders at every request, by its config.
export const dynamic = "force-dynamic";

export default function DynamicPage() {
  return <p>Rendered as {Math.random()}</p>;
}
