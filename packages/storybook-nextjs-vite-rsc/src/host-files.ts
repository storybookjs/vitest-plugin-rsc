// The story file from the root of the project, for its stylesheets.
// Storybook names it from its working directory, which the preset gives.
// Without the preset, as for a portable story under Vitest, the plugin's
// own default: the setup files and the test file.
export function hostFilesOf(fileName: string): string[] | undefined {
  const workingDir = import.meta.env.STORYBOOK_NEXTJS_RSC_WORKING_DIR;
  if (workingDir === undefined) return undefined;
  const file: string[] = [];
  for (const part of `${workingDir}/${fileName}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && file.length > 0 && file.at(-1) !== "..") file.pop();
    else file.push(part);
  }
  return [file.join("/")];
}
