export default async function SelectedLayoutPage({
  params,
}: {
  params: Promise<{ item: string }>;
}) {
  const { item } = await params;

  return <h1>Selected layout page {item}</h1>;
}
