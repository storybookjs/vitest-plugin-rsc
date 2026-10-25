import { SpeedFeaturesProbe } from "#components/speed-features-probe.tsx";

// For test/speed-features.test.tsx: a page that fast mode renders in its
// kept app. `?mismatch` renders another text on the server than in the
// browser, `?fail` fails the render.
export default async function SpeedFeaturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { mismatch, fail } = await searchParams;
  if (fail !== undefined) throw new Error("The page failed to render");
  return <SpeedFeaturesProbe mismatch={mismatch !== undefined} />;
}
