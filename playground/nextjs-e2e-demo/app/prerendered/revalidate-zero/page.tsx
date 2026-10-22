// A page that `next build` renders at every request, by its `revalidate`.
export const revalidate = 0;

export default function RevalidateZeroPage() {
  return <p>Rendered as {Math.random()}</p>;
}
