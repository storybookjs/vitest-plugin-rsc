// The modules the preset makes: see preset.ts.
declare module "virtual:@storybook/nextjs-vite-rsc/project" {
  /** The files of the project that render around every story, by their path from the root. */
  export const previewFiles: string[];
  /**
   * The root and the working directory of Storybook, by the names of their
   * directories from the directory both are in.
   */
  export const workingDir: { root: string[]; cwd: string[] };
}
