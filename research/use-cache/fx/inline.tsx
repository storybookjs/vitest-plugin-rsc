import { cacheTag } from "next/cache";
export async function getPost(id: string) {
  "use cache";
  cacheTag(`post-${id}`);
  return { id };
}
const arrow = async (x: number) => {
  "use cache: remote";
  return x * 2;
};
export async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = `scope-${id}`;
  async function closure(label: string) {
    "use cache: private";
    return `${scope} ${label}`;
  }
  return <div>{await closure("a")}{await arrow(1)}</div>;
}
