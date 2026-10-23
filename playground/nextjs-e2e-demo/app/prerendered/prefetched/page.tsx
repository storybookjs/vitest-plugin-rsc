// A page that `next build` prerenders, which a test prefetches first.
export default function PrefetchedPage() {
  return <p>Rendered as {Math.random()}</p>;
}
