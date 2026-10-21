// Stands in for `escape-string-regexp`, which Next's tests import and the
// runner does not install: the body of its version 4, which they use.
export default function escapeStringRegexp(string: string): string {
  return string.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
}
