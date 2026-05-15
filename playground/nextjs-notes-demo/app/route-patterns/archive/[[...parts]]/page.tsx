export default async function ArchiveOptionalCatchAllRoutePatternPage({
  params,
}: {
  params: Promise<{ parts?: string[] }>;
}) {
  const { parts = [] } = await params;

  return <h1>Notes archive: {parts.length ? parts.join("/") : "index"}</h1>;
}
