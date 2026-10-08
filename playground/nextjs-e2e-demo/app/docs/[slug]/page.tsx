import { RouterState } from "../../components/router-state.tsx";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
};

export default async function DocPage({ params, searchParams }: Props) {
  return (
    <>
      <h1>Docs: {(await params).slug}</h1>
      <p>Search params: {JSON.stringify(await searchParams)}</p>
      <RouterState />
    </>
  );
}
