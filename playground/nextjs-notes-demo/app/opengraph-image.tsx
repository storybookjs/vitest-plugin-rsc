import { ImageResponse } from "next/og";

export const alt = "Vitest RSC Notes social image";
export const contentType = "image/png";
export const size = {
  height: 630,
  width: 1200,
};

export function generateImageMetadata() {
  return [
    {
      alt,
      contentType,
      id: "notes",
      size,
    },
  ];
}

export default function OpenGraphImage({ id = "notes" }: { id?: string }) {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "white",
        color: "black",
        display: "flex",
        fontSize: 96,
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      Open Graph {id}
    </div>,
    size,
  );
}
