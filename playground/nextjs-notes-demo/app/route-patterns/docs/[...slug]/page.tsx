export default async function DocsCatchAllRoutePatternPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ slug?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  return (
    <>
      <h1>Notes docs: {slug.join("/")}</h1>
      <p data-testid="notes-docs-search-slug">{query.slug ?? "none"}</p>
    </>
  );
}
