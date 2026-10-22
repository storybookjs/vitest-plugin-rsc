// `next build` prerenders the paths of `generateStaticParams`, and with
// `dynamicParams = false` no other: another is not found.
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ slug: "listed" }];
}

export default async function ListedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <p>
      {slug}, rendered as {Math.random()}
    </p>
  );
}
