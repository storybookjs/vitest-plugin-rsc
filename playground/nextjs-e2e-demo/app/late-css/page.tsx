import { LateStyled } from "../components/late-styled.tsx";

export default async function LateCssPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key = "" } = await searchParams;
  return <LateStyled stylesheetKey={key} />;
}
