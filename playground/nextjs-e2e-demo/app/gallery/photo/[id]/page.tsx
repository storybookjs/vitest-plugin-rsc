type Props = { params: Promise<{ id: string }> };

export default async function PhotoPage({ params }: Props) {
  return <h1>Photo {(await params).id}</h1>;
}
