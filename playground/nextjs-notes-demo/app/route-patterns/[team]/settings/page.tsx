import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ team: string }>;
}): Promise<Metadata> {
  const { team } = await params;

  return {
    title: `${team} settings metadata`,
  };
}

export default async function TeamSettingsRoutePatternPage({
  params,
}: {
  params: Promise<{ team: string }>;
}) {
  const { team } = await params;

  return <h1>{team} notes settings page</h1>;
}
