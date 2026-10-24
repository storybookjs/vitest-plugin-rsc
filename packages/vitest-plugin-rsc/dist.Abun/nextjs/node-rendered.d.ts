import { n as NodeReports } from "../node-on-page-DUz3A_G9.js";
import { ReactNode } from "react";

//#region src/nextjs/node-rendered.d.ts
/** @internal For client.tsx, as it starts the page. */
declare function setNodeOnPage(node: NodeReports | undefined): void;
/**
 * @internal What the server renders around the node of `renderServer()`, from
 * its first render: it tells `rerender()` the page's router once the node is
 * mounted, which render of the node the page shows, and when the node has
 * left the page. It renders the node and nothing else.
 */
declare function NodeRendered({
  version,
  children
}: {
  version: number;
  children?: ReactNode;
}): ReactNode;
//#endregion
export { NodeRendered, setNodeOnPage };