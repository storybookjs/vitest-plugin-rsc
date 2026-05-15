import { ImageResponse } from "next/og";

export const alt = "Vitest RSC Notes Twitter image";
export const contentType = "image/png";
export const size = {
  height: 600,
  width: 1200,
};

export function generateImageMetadata() {
  return [
    {
      alt,
      contentType,
      id: "notes-twitter",
      size,
    },
  ];
}

export default function TwitterImage({ id = "notes-twitter" }: { id?: string }) {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "white",
        color: "black",
        display: "flex",
        fontSize: 88,
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      Twitter {id}
    </div>,
    size,
  );
}
