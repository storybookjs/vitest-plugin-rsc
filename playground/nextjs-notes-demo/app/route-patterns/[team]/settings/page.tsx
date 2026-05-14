export default async function TeamSettingsRoutePatternPage({
  params,
}: {
  params: Promise<{ team: string }>;
}) {
  const { team } = await params;

  return <h1>{team} notes settings page</h1>;
}
