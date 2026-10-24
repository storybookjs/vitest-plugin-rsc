declare module "vitest" {
  interface ProvidedContext {
    envName: string;
    t0: number;
    tConfig: number;
    iterations: number;
  }
}
export {};
