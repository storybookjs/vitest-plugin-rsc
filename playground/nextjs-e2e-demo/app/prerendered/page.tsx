// A page that `next build` prerenders: it reads nothing of the request.
export default function PrerenderedPage() {
  return <p>Rendered as {Math.random()}</p>;
}
