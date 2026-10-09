// The Vitest that the plugin runs in. Vitest is a peer dependency of any
// version, and an optional one: a host like Storybook installs the plugin
// next to the Vitest of the project's own tests, which can be another major,
// and npm refuses a peer that is there in a version out of its range.
export const minimumVitest = "5.0.3";

const partsOf = (version: string) => version.split(/[.+-]/, 3).map((part) => Number(part) || 0);

/** Throws for a Vitest that the plugin does not run in. */
export function assertVitestVersion(version: string): void {
  const [major = 0, minor = 0, patch = 0] = partsOf(version);
  const [needMajor = 0, needMinor = 0, needPatch = 0] = partsOf(minimumVitest);
  const isNewEnough =
    major !== needMajor
      ? major > needMajor
      : minor !== needMinor
        ? minor > needMinor
        : patch >= needPatch;
  if (isNewEnough) return;
  throw new Error(
    `vitest-plugin-rsc: runs in Vitest ${minimumVitest} or later, and this is Vitest ${version}. ` +
      `Update vitest and the @vitest packages of the project.`,
  );
}
