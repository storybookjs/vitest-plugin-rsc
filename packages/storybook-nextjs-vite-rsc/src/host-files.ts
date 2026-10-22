// The story file from the root of the project, for its stylesheets.
// Storybook names it from its working directory, which the preset gives.
// Without the preset, or for a portable story, which has no file name, the
// plugin's own default: under Vitest the setup files and the test file,
// which the story file is for addon-vitest.
export function hostFilesOf({ fileName }: { fileName?: unknown }): string[] | undefined {
  const workingDir = import.meta.env.STORYBOOK_NEXTJS_RSC_WORKING_DIR;
  if (workingDir === undefined || typeof fileName !== "string") return undefined;
  const file: string[] = [];
  for (const part of `${workingDir}/${fileName}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && file.length > 0 && file.at(-1) !== "..") file.pop();
    else file.push(part);
  }
  return [file.join("/")];
}
