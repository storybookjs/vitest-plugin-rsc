"use client";
import { useEffect, useLayoutEffect } from "react";
import { useRouter } from "next/navigation.js";
//#region src/nextjs/node-rendered.tsx
let nodeOnPage;
/** @internal For client.tsx, as it starts the page. */
function setNodeOnPage(node) {
	nodeOnPage = node;
}
/**
* @internal What the server renders around the node of `renderServer()`, from
* its first render: it tells `rerender()` the page's router once the node is
* mounted, which render of the node the page shows, and when the node has
* left the page. It renders the node and nothing else.
*/
function NodeRendered({ version, children }) {
	const { refresh } = useRouter();
	useLayoutEffect(() => nodeOnPage?.mounted(refresh), [refresh]);
	useEffect(() => {
		nodeOnPage?.shown(version);
		return () => nodeOnPage?.hidden();
	}, [version]);
	return children;
}
//#endregion
export { NodeRendered, setNodeOnPage };
