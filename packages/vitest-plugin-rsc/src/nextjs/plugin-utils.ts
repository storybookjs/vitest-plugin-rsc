import { createRequire } from "node:module";
import path from "node:path";

export function getProjectRoot(config: { root?: string }): string {
  return path.resolve(config.root ?? process.cwd());
}

export function createProjectRequire(root: string): NodeJS.Require {
  return createRequire(path.join(root, "package.json"));
}

export function tryResolveFromProject(root: string, id: string): string | undefined {
  try {
    return createProjectRequire(root).resolve(id);
  } catch {
    return;
  }
}

export function isProjectFile(root: string, id: string): boolean {
  const file = id.replace(/\?.*$/, "");
  if (!path.isAbsolute(file)) return false;

  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function splitOnce(value: string, separator: string): [string, string?] {
  const index = value.indexOf(separator);
  if (index < 0) return [value];

  return [value.slice(0, index), value.slice(index + separator.length)];
}

export function normalizePath(file: string) {
  return file.split(path.sep).join("/");
}
