//#region src/nextjs/host-document.ts
let inContext = false;
/** Says whether a browser context of the app is open: browser-context.ts does. */
function appHasNavigations(open) {
	inContext = open;
}
/**
* A navigation without a page of the app, which has the router, under
* Vitest: a component that a test file with `"use client"` rendered has none.
*/
function noRouter(url) {
	return /* @__PURE__ */ new Error(`vitest-plugin-rsc: a link or a form navigated to ${url.href}, and there is no page of the app to navigate in: no page of renderServer() is open, and a test file with "use client" has none. Test navigation in a page of renderServer(), in a test file without "use client".`);
}
/**
* Keeps the host's document while the host renders components outside a
* browser context of the app: a link or a form that would load another
* document is stopped, and `report` hears of it with the URL it would load.
* By default `reportError()` gets an error that says why. A declared
* download, like `<a download>`, is the browser's, and while a context is
* open, the app has the navigations. Until the function it returns is
* called.
*/
function keepHostDocument(report = reportLoad) {
	const { navigation } = window;
	const keep = (event) => {
		if (inContext || event.defaultPrevented) return;
		const { destination, hashChange, downloadRequest } = event;
		if (destination.sameDocument || hashChange || !event.cancelable) return;
		if (downloadRequest !== null || destination.url === window.location.href) return;
		event.preventDefault();
		report(new URL(destination.url));
	};
	navigation?.addEventListener("navigate", keep);
	return () => navigation?.removeEventListener("navigate", keep);
}
function reportLoad(url) {
	reportError(/* @__PURE__ */ new Error(`vitest-plugin-rsc: a link or a form navigated to ${url.href}, which would load another document in place of the host's. The host renders it outside a browser context of the app, where there is no router of Next's: the host's document stays.`));
}
//#endregion
export { keepHostDocument as n, noRouter as r, appHasNavigations as t };
