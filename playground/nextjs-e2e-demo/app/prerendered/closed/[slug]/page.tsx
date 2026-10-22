// A route with `dynamicParams = false` that a test prefetches first.
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ slug: "open" }];
}

export default async function ClosedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <p>
      {slug}, rendered as {Math.random()}
    </p>
  );
}
