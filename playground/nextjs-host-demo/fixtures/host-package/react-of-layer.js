// A file of a UI of the host, like the docs renderer of a Storybook
// framework: code of the browser layer, without the directive. It says which
// build of React it has: the browser layer's has hooks, the react-server build
// of the rsc layer does not.
import * as React from "react";

export function reactOfLayer() {
  return typeof React.useState === "function" ? "react" : "react-server";
}
