export default async function DocsCatchAllRoutePatternPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;

  return <h1>Notes docs: {slug.join("/")}</h1>;
}
