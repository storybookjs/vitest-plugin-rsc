// A page with params and without `generateStaticParams`, which `force-static`
// lets `next build` prerender: every path at its first request.
export const dynamic = "force-static";

export default async function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <p>
      {slug}, rendered as {Math.random()}
    </p>
  );
}
