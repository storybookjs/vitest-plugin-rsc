declare module "next/dist/compiled/path-to-regexp" {
  export type Token =
    | string
    | {
        name: string | number;
        prefix: string;
        suffix: string;
        pattern: string;
        modifier: string;
      };

  export function parse(path: string): Token[];
}
