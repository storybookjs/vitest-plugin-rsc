import "./styles-shared-CP5LkHjp.js";
//#region src/nextjs/document.ts
const elements = (of) => [
	of.documentElement,
	of.head,
	of.body
];
const attributesOf = (element) => Array.from(element.attributes, ({ name, value }) => [name, value]);
let unload;
const keptProperties = /* @__PURE__ */ new WeakMap();
/**
* Keeps the properties `keys` of `target`, the document or one of its
* elements, as the pages are left, until it is called again: the marks of
* React DOM on the root of an app that renders the pages after its first
* (`renderAgain()` in client.tsx). Without `keys` they are no longer kept,
* and the app that kept them removes them.
*/
function keepProperties(target, keys) {
	if (keys) keptProperties.set(target, new Set(keys));
	else keptProperties.delete(target);
}
let preloads = [];
let runnerHref;
/**
* The URL of the document without the page that is open: the runner's, which
* the page shows as its own while it is open.
*/
function documentUrl() {
	return runnerHref ?? window.location.href;
}
const navigation = window.navigation;
function activate() {
	if (!navigation || !("activation" in navigation)) return () => {};
	const activation = {
		entry: navigation.currentEntry,
		from: null,
		navigationType: "push"
	};
	Object.defineProperty(navigation, "activation", {
		configurable: true,
		enumerable: true,
		get: () => activation
	});
	return () => Reflect.deleteProperty(navigation, "activation");
}
function staysDuringPage(node) {
	return node instanceof HTMLScriptElement || node instanceof HTMLStyleElement || isPreload(node);
}
function isPreload(node) {
	return node instanceof HTMLLinkElement && (node.relList.contains("modulepreload") || node.relList.contains("preload") && node.as !== "style");
}
function isViteStyle(node) {
	return node instanceof HTMLStyleElement && node.hasAttribute("data-vite-dev-id");
}
function isGraphStylesheet(node) {
	return node instanceof HTMLLinkElement && node.hasAttribute("data-vitest-plugin-rsc-graph");
}
function stylesheetsOf(parent, url) {
	return Array.from(parent.querySelectorAll("link[rel~=\"stylesheet\"][href]")).filter((link) => !link.relList.contains("alternate") && link.getAttribute("href") && (!link.type || link.type === "text/css") && URL.canParse(link.getAttribute("href"), url) && new URL(link.getAttribute("href"), url).origin === window.location.origin);
}
function stylesheetLoaded(link) {
	return new Promise((resolve) => {
		link.addEventListener("load", () => resolve(), { once: true });
		link.addEventListener("error", () => resolve(), { once: true });
	});
}
function setAttributes(element, attributes) {
	for (const { name } of Array.from(element.attributes)) element.removeAttribute(name);
	for (const [name, value] of attributes) element.setAttribute(name, value);
}
/**
* Starts the files of the route of the page that loads next, as the server
* renders it: `stylesheets` as Next links them, in the CORS mode of
* `crossOrigin`, and `modules`. By their URLs. They go with that page.
*/
function preloadPage({ stylesheets, crossOrigin, modules }) {
	const links = [...stylesheets.map((href) => ({
		href,
		rel: "preload",
		as: "style",
		crossOrigin
	})), ...modules.map((href) => ({
		href,
		rel: "modulepreload",
		as: "",
		crossOrigin: ""
	}))];
	for (const { href, rel, as, crossOrigin } of links) {
		if (preloads.some((link) => link.href === href)) continue;
		const link = document.createElement("link");
		link.rel = rel;
		if (as) link.as = as;
		if (crossOrigin !== void 0) link.crossOrigin = crossOrigin;
		link.href = href;
		document.head.append(link);
		preloads.push(link);
	}
}
/**
* Replaces the page in this document with the one the server sent as `html`:
* its `<head>` first, the rest once the stylesheets of the `<head>` have
* loaded, and runs its inline scripts in document order once the stylesheets
* of the rest have too. Resolves then, and without running them for a page
* that was left in the meantime.
*
* The page is there in full before the app starts, so the document has loaded
* by the time Next's client looks: it reads the Flight payload that Next's
* inline scripts left in `self.__next_f`, and hydrates.
*
* With a `container`, the page is the one of a node, which renders no
* `<html>` or `<body>`, and what is in the document stays the test's. What
* the HTML parser puts in `<body>` goes in the container: the node, with the
* scripts it renders, and after it the scripts of Next and React.
*
* The page takes the entry of the history that the document is at, or with
* `after` gets one of its own, after that entry.
*/
async function loadDocument(html, url, container, after) {
	leaveDocument();
	const ownPreloads = new Set(preloads);
	preloads = [];
	const runnerUrl = window.location.href;
	runnerHref = runnerUrl;
	const runnerBody = document.body;
	const runnerAttributes = elements(document).map(attributesOf);
	const reactTargets = [
		document,
		document.documentElement,
		document.head
	];
	if (container) reactTargets.push(container);
	const runnerProperties = reactTargets.map((target) => new Set(Reflect.ownKeys(target)));
	const runnerAdopted = Array.from(document.adoptedStyleSheets);
	const runnerScripts = new Set(document.querySelectorAll("script"));
	const before = new Set([...document.head.childNodes, ...runnerBody.childNodes].filter((node) => !ownPreloads.has(node)));
	const parked = [];
	const graphParked = /* @__PURE__ */ new Set();
	const switchedOff = [];
	const pageBody = document.createElement("body");
	let leaveNow;
	const left = new Promise((resolve) => leaveNow = resolve);
	let deactivate = () => {};
	const leave = () => {
		try {
			leaveNow();
			container?.replaceChildren();
			for (const parent of [document.head, pageBody]) for (const node of Array.from(parent.childNodes)) if (!before.has(node) && !isViteStyle(node) && !isGraphStylesheet(node)) node.remove();
		} finally {
			runnerHref = void 0;
			deactivate();
			if (window.location.href !== runnerUrl) window.history.replaceState(null, "", runnerUrl);
		}
		document.head.append(...parked.filter((node) => !graphParked.has(node) || isGraphStylesheet(node)));
		for (const [style, media] of switchedOff) if (media === null) style.removeAttribute("media");
		else style.media = media;
		runnerBody.append(...pageBody.childNodes);
		pageBody.replaceWith(runnerBody);
		elements(document).forEach((element, index) => setAttributes(element, runnerAttributes[index]));
		document.adoptedStyleSheets = runnerAdopted;
		reactTargets.forEach((target, index) => {
			for (const key of Reflect.ownKeys(target)) {
				if (runnerProperties[index].has(key) || keptProperties.get(target)?.has(key)) continue;
				Reflect.deleteProperty(target, key);
			}
		});
		delete self.__next_f;
		delete self.__next_s;
	};
	unload = leave;
	const page = new DOMParser().parseFromString(html, "text/html");
	for (const redirect of page.querySelectorAll("[id=\"__next-page-redirect\"]")) redirect.removeAttribute("http-equiv");
	const sources = new Set(Array.from(page.querySelectorAll("script[src]"), (script) => script.src));
	for (const link of page.querySelectorAll("link[rel=\"preload\"][as=\"script\"]")) if (sources.has(link.href)) link.remove();
	const stylesheetsOfHead = stylesheetsOf(page.head, url);
	const stylesheetsOfBody = stylesheetsOf(page.body, url);
	const loaded = (stylesheets) => Promise.race([Promise.all(stylesheets.filter((link) => !link.disabled).map(stylesheetLoaded)), left]);
	if (after) {
		window.history.replaceState(after.state, "", after.url);
		window.history.pushState(null, "", url);
	} else window.history.replaceState(null, "", url);
	deactivate = activate();
	document.head.append(...page.head.childNodes);
	await loaded(stylesheetsOfHead);
	if (unload !== leave) return;
	for (const node of runnerBody.childNodes) before.add(node);
	for (const node of container ? [] : document.head.childNodes) {
		if (!before.has(node)) continue;
		if (isViteStyle(node)) switchedOff.push([node, node.getAttribute("media")]);
		else if (!staysDuringPage(node)) parked.push(node);
		if (isGraphStylesheet(node)) graphParked.add(node);
	}
	for (const node of parked) document.head.removeChild(node);
	for (const [style] of switchedOff) style.media = "not all";
	const staying = Array.from(runnerBody.childNodes).filter((node) => container || staysDuringPage(node));
	setAttributes(pageBody, attributesOf(runnerBody));
	document.documentElement.replaceChild(pageBody, runnerBody);
	pageBody.append(...staying);
	if (container) container.append(...page.body.childNodes);
	else {
		elements(page).forEach((element, index) => setAttributes(elements(document)[index], attributesOf(element)));
		pageBody.append(...page.body.childNodes);
	}
	await loaded(stylesheetsOfBody);
	if (unload !== leave) return;
	for (const script of document.querySelectorAll("script")) {
		if (runnerScripts.has(script) || script.src) continue;
		if (!script.type || script.type === "text/javascript" || script.type === "module") try {
			(0, eval)(script.textContent ?? "");
		} catch (error) {
			reportError(error);
		}
	}
}
let queueStreamedContent;
/** `self.$RC` of a page. */
const streamedContentQueue = {
	configurable: true,
	set: (queue) => queueStreamedContent = queue,
	get: () => queueStreamedContent && ((...args) => {
		queueStreamedContent(...args);
		const { $RB: queued, $RV: reveal } = self;
		try {
			if (queued?.length && reveal) reveal(queued);
		} catch (error) {
			reportError(error);
		}
	})
};
function leaveDocument() {
	const leave = unload;
	unload = void 0;
	leave?.();
}
/**
* Leaves the page, and the one that was loading: the document is as it was
* before the page.
*/
function unloadDocument() {
	try {
		leaveDocument();
	} finally {
		for (const link of preloads) link.remove();
		preloads = [];
	}
}
//#endregion
export { streamedContentQueue as a, preloadPage as i, keepProperties as n, unloadDocument as o, loadDocument as r, documentUrl as t };
