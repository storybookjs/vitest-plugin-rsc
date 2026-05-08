declare module "*.css";

declare module "marked" {
  export default function marked(markdown: string): string;
}
