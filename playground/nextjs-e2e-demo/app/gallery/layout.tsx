import type { ReactNode } from "react";

// A slot for the route that intercepts a photo: app/routing.test.tsx.
export default function GalleryLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
