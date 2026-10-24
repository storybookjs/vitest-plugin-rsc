//#region src/nextjs/styles-shared.ts
/**
* The file of a static build with the files a page loads besides the layers:
* the stylesheets and the modules of every page route, and the stylesheets
* of every file of the host, in its directory.
*/
const builtFilesPath = "vitest-plugin-rsc/next-files.json";
/**
* Where the dev server answers the page with stylesheets, over the websocket
* of the page (`askDevServer()` in ../utils.ts), for a `StylesheetsQuestion`.
*/
const stylesheetsEvent = "vitest-plugin-rsc:next-stylesheets";
/**
* What the dev server tells the page after a change of stylesheets that it
* links, without class names: the URL of the version of now of each, which
* the page moves every link of the stylesheet to (stylesheet-versions.ts).
*/
const stylesheetsChangedEvent = "vitest-plugin-rsc:next-stylesheets-changed";
/** Where Next's build puts the CSS of an app, under `/_next/`. */
const cssDirectory = "static/css";
/**
* The version of its CSS that the path of a stylesheet of the dev server has
* after the directory, `static/css/<version>/app/globals.css`: see styles.ts.
*/
const cssVersionPattern = "[0-9a-f]{16}";
const versionSegmentRE = new RegExp(`/${cssDirectory}/${cssVersionPattern}/`);
/**
* The stylesheet that a URL of a link is of, whatever its version and however
* its path is encoded: the path of the URL without its version, decoded.
* Nothing for a URL that is no stylesheet of the dev server.
*/
function stylesheetOfUrl(url) {
	const { pathname } = new URL(url, "http://n");
	if (!versionSegmentRE.test(pathname)) return void 0;
	try {
		return pathname.replace(versionSegmentRE, `/${cssDirectory}/`).split("/").map(decodeURIComponent).join("/");
	} catch {
		return;
	}
}
/**
* What marks the `<link>` of a stylesheet of a file of the host, which
* `linkStylesheetsOf()` linked (client-graph.ts): the host's, not a page's,
* so a page that is left does not take it (document.ts).
*/
const graphStylesheetAttribute = "data-vitest-plugin-rsc-graph";
/**
* What the loader tree of the route of a node names its page, where a page of
* the app has its file. Next looks up the stylesheets of the node by it.
*/
const componentPagePath = "vitest-plugin-rsc/component";
/**
* The key of a file of the host in `BuiltFiles.hostFiles`, of a path that
* the host names it by: from the root of the project, which `./` and `..`
* may be part of, or absolute. A build has no path of the machine, so an
* absolute path is the longest key that it ends with.
*/
function builtFileKey(file, keys) {
	file = file.replaceAll("\\", "/");
	if (file.startsWith("/") || /^[a-z]:\//i.test(file)) {
		let found;
		for (const key of keys) if (file.endsWith(`/${key}`) && key.length > (found?.length ?? -1)) found = key;
		return found;
	}
	const segments = [];
	for (const segment of file.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === ".." && segments.length > 0 && segments.at(-1) !== "..") segments.pop();
		else segments.push(segment);
	}
	const key = segments.join("/");
	return keys.includes(key) ? key : void 0;
}
/**
* The stylesheets of a route of a static build that is served from
* `directory`, a URL: what the dev server answers at `stylesheetsEvent`. For
* the route of a node, the node has the stylesheets of `files`, the files of
* the host that render it (`hostFiles` of `renderServer()`), in their order,
* each once. A file that the build has none for, `missing` is told of.
*
* Next links a stylesheet at its path under the asset path, from the root of
* the site. A build can be served from any directory, so that path goes up to
* the root first when it has to: `/_next/../docs/_next/static/css/page.css`.
*
* Next inlines no CSS of a static build: what a stylesheet of it names, like a
* font, is named by the way from that stylesheet.
*/
function builtStylesheetsOf(built, entry, directory, files = [], missing = () => {}) {
	const from = built.assetPath.split("/").filter(Boolean);
	const pathOf = (file) => {
		const to = `${decodeURIComponent(new URL(directory).pathname)}${file}`.split("/").filter(Boolean);
		let common = 0;
		while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
		return [...from.slice(common).map(() => ".."), ...to.slice(common)].join("/");
	};
	const segments = { ...built.routes[entry] };
	if (segments["vitest-plugin-rsc/component"] && files.length > 0) {
		const keys = Object.keys(built.hostFiles);
		const ofFiles = files.flatMap((file) => {
			const key = builtFileKey(file, keys);
			if (key === void 0) missing(file);
			return key === void 0 ? [] : built.hostFiles[key];
		});
		segments[componentPagePath] = [.../* @__PURE__ */ new Set([...ofFiles, ...segments[componentPagePath]])];
	}
	return Object.fromEntries(Object.entries(segments).map(([segment, stylesheets]) => [segment, stylesheets.map((file) => {
		const fonts = built.fonts[file];
		return fonts ? {
			path: pathOf(file),
			fonts: fonts.map(pathOf)
		} : { path: pathOf(file) };
	})]));
}
/**
* The stylesheets of a file of the host in a static build that is served
* from `directory`, a URL: those that `hostFiles` has for it by its key,
* `file`, as URLs. What the dev server answers for the file at
* `stylesheetsEvent`.
*/
function builtHostFileStylesheetsOf(built, file, directory) {
	return (built.hostFiles[file] ?? []).map((stylesheet) => new URL(stylesheet, directory).href);
}
//#endregion
export { componentPagePath as a, graphStylesheetAttribute as c, stylesheetsEvent as d, builtStylesheetsOf as i, stylesheetOfUrl as l, builtFilesPath as n, cssDirectory as o, builtHostFileStylesheetsOf as r, cssVersionPattern as s, builtFileKey as t, stylesheetsChangedEvent as u };
