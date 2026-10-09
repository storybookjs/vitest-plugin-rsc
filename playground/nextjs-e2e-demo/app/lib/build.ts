// Which build of React made an element: the development build keeps a
// `_store` on it, for its key warnings, and the production build does not.
export function buildOf(element: object): "development" | "production" {
  return "_store" in element ? "development" : "production";
}
