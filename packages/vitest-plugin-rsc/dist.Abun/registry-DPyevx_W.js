import { t as registryGlobal } from "./registry-global-C89TxDmn.js";
//#region src/nextjs/registry.ts
const scope = globalThis;
const registry = scope[registryGlobal] ??= {
	appPages: {},
	serverActions: /* @__PURE__ */ new Map()
};
/**
* What the browser layer loads with no page to load it in: nothing, ever, as
* the closed runner of a page that was left.
*/
const loadsNothing = () => new Promise(() => {});
/**
* What `renderServer()` opened, at a URL that belongs to it: one with its
* pathname. That is the document, and what the page sends there while it is
* open: a Server Action, `router.refresh()`, a change of search params. A URL
* with another pathname is the app's, as always. The server and the browser
* layer both ask, so they agree on it.
*/
function openedAt(url) {
	const { opened } = registry;
	return opened?.pathname === url.pathname ? opened : void 0;
}
/**
* Next's build gives the module of a Server Action an id. Here the id of the
* action already says where it is, so the module id is the action id, marked.
*/
const actionModulePrefix = "action:";
//#endregion
export { registry as i, loadsNothing as n, openedAt as r, actionModulePrefix as t };
