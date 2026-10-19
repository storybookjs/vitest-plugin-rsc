// A module of a package of the host that only a module of a package without
// side effects imports, in the browser layer: see ../host-package/ui/tagged.js.
// The host reads what it was given through the page's one instance.
export const tags = [];

export function tagged(text) {
  tags.push(text);
}
