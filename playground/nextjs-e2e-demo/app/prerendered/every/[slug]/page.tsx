// A `generateStaticParams` that lists no path: `next build` prerenders every
// path at its first request.
export function generateStaticParams() {
  return [];
}

export default async function EveryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <p>
      {slug}, rendered as {Math.random()}
    </p>
  );
}
