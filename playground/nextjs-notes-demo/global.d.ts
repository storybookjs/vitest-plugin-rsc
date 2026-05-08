declare module "*.css";

declare module "marked" {
  export default function marked(markdown: string): string;
}

declare var onNavigate: import("vitest").Mock<(url: URL) => void>;
