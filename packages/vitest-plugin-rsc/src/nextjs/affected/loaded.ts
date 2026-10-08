/**
 * What each test file has loaded without an import of its own: see
 * browser.ts.
 */
export function loadedModules() {
  const loaded = new Map<string, Set<string>>();
  return {
    add(testFile: string, modules: string[]): void {
      let all = loaded.get(testFile);
      if (!all) loaded.set(testFile, (all = new Set()));
      for (const id of modules) all.add(id);
    },
    of: (testFile: string): string[] => [...(loaded.get(testFile) ?? [])],
    has: (testFile: string): boolean => loaded.has(testFile),
    forget: (testFile: string): void => void loaded.delete(testFile),
    testFiles: (): string[] => [...loaded.keys()],
  };
}
