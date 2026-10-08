type Props = { params: Promise<{ id: string }> };

// The photo, for a visitor who comes from the gallery.
export default async function PhotoModal({ params }: Props) {
  return <dialog open>Photo {(await params).id}, over the gallery</dialog>;
}
