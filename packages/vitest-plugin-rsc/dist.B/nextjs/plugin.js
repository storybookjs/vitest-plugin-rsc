import { c as withStaticBuild, i as cssBuildDirPlaceholder, l as createRunnerEnvironmentPlugins, n as testFileReferencesPlugin, o as toBuildDir, r as testFilesPlugin, s as withBuiltFiles } from "../test-file-references-BNM34gwD.js";
import { c as builtHostModuleUrl, l as hostModulePrefix, m as clientReferencesId, n as answerPage } from "../websocket-bridge-20VEq6PG.js";
import { n as timerNames, r as timersKey } from "../timers-1mbI-StR.js";
import { t as registryGlobal } from "../registry-global-C89TxDmn.js";
import { a as componentPagePath, d as stylesheetsEvent, n as builtFilesPath, o as cssDirectory, s as cssVersionPattern, u as stylesheetsChangedEvent } from "../styles-shared-CP5LkHjp.js";
import { t as clientFileKeyExport } from "../client-file-key-BwvL_T8k.js";
import { n as receivers } from "../adapter-4-4wEVTw.js";
import { createRequire, isBuiltin } from "node:module";
import { createFilter, isCSSRequest, normalizePath, parseAst, parseAstAsync, send, transformWithOxc, version } from "vite";
import { getPluginApi } from "@vitejs/plugin-rsc/plugin";
import { ssrImportMetaKey } from "vite/module-runner";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { hasDirective, transformDirectiveProxyExport, transformHoistInlineDirective, transformWrapExport } from "@vitejs/plugin-rsc/transforms";
import { escapePath } from "tinyglobby";
import MagicString from "magic-string";
import { init, parse } from "cjs-module-lexer";
import { Worker } from "node:worker_threads";
import querystring from "node:querystring";
import { compileFunction } from "node:vm";
import os from "node:os";
import { stripVTControlCharacters } from "node:util";
//#region src/nextjs/flight.ts
const rscFlightCodec = {
	server: [
		"renderToReadableStream",
		"decodeReply",
		"decodeReplyFromAsyncIterable",
		"decodeAction",
		"decodeFormState",
		"createTemporaryReferenceSet",
		"registerServerReference",
		"registerClientReference",
		"createClientModuleProxy"
	],
	static: ["prerender"],
	client: [
		"createFromReadableStream",
		"encodeReply",
		"createTemporaryReferenceSet"
	]
};
const owners = {
	server: "flightServer",
	static: "flightStatic",
	client: "flightClient"
};
/**
* The module that the rsc layer gets for an entry of Next's codec. It has
* every export of the entry, as the installed `next` has it, and forwards it
* to the adapter that rsc.ts puts in `registry`. The lookup is deferred to
* the call, so a pre-bundled chunk can load before rsc.ts has. An export
* without an adapter throws when it is called.
*/
function flightBridge(entry, exports, nextVersion, registry) {
	const adapted = rscFlightCodec[entry];
	return exports.map((name) => {
		if (adapted.includes(name)) return `export const ${name} = (...args) => ${registry}.${owners[entry]}.${name}(...args);`;
		const message = `vitest-plugin-rsc: \`${name}\` of Next's Flight codec is not supported in the rsc layer (next@${nextVersion}).`;
		return `export const ${name} = () => { throw new Error(${JSON.stringify(message)}); };`;
	}).join("\n");
}
//#endregion
//#region src/nextjs/build.ts
const nextBuilds = ["development", "production"];
/**
* Makes `process.env.NODE_ENV` `"production"` in the files of Next: its
* runtime and the copies of React, React DOM, the scheduler and the Flight
* codec that it ships, which every layer runs on. React's entry files then
* pick its production build by themselves. The files of the app and of its
* other packages keep the `NODE_ENV` they have. For the dependency optimizer,
* which pre-bundles all of Next.
*
* A define, not a text replacement: Next's files also have `process.env.NODE_ENV`
* in strings, and assign it. Its name is in the hash of the pre-bundled
* dependencies, which then are not the ones of the development build.
*/
function nextProductionPlugin(nextDir) {
	const dist = `${normalizePath(nextDir)}/dist/`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return {
		name: "vitest-plugin-rsc:next-production",
		transform: {
			filter: {
				id: new RegExp(`^${dist}.*\\.[cm]?js$`),
				code: "process.env.NODE_ENV"
			},
			async handler(code, id) {
				const { code: compiled, map } = await transformWithOxc(code, id, {
					lang: "js",
					define: { "process.env.NODE_ENV": "\"production\"" }
				});
				return {
					code: compiled,
					map
				};
			}
		}
	};
}
//#endregion
//#region src/nextjs/compile.ts
const fontPrefix = "\0vitest-plugin-rsc/next-font/";
const fontRequest = /^next\/font\/(?:google|local)\/target\.css\?/;
/**
* The call of a `next/font` function whose CSS a module is, by the module's
* id: the import the SWC transform turns the call into. Nothing for any other
* module.
*/
function fontRequestOf(id) {
	if (!id.startsWith(fontPrefix)) return void 0;
	const name = id.slice(29).split("?")[0];
	if (!name.endsWith(".css")) return void 0;
	return Buffer.from(name.slice(0, -4), "base64url").toString();
}
const sourceFile = /\.(?:tsx|ts|jsx|js|mjs)$/;
function createDependencyCompilePlugin(getProject, layer, isAppCode) {
	return {
		name: "vitest-plugin-rsc:next-compile-dependency",
		resolveId(source) {
			if (fontRequest.test(source)) return {
				id: source,
				external: true
			};
		},
		async transform(code, id) {
			if (!/\.[cm]?js$/.test(id) || !/\bnext\/font\b/.test(code) || isAppCode(id, layer)) return;
			if (!path.relative(getProject().nextDir, id).startsWith("..")) return;
			const compiled = await getProject().compile(code, id, layer);
			return compiled && {
				code: compiled.code,
				map: compiled.map ?? null
			};
		}
	};
}
function createScanCompilePlugin(getProject, layer, isAppCode) {
	return {
		name: `vitest-plugin-rsc:next-compile-scan:${layer}`,
		async transform(code, id) {
			if (id.includes("?") || !sourceFile.test(id) || !isAppCode(id, layer)) return;
			const compiled = await getProject().compile(code, id, layer).catch(() => void 0);
			if (!compiled || compiled.refused) return;
			return {
				code: compiled.code,
				map: compiled.map ?? null
			};
		}
	};
}
function createCompilePlugin(getProject, layerOf, isAppCode) {
	return {
		name: "vitest-plugin-rsc:next-compile",
		enforce: "pre",
		configureServer(server) {
			const serveFile = async (request, response) => {
				server.middlewares.handle(request, response, (error) => {
					response.statusCode = error ? 500 : 404;
					response.end();
				});
			};
			const serve = async (request, response) => {
				const project = getProject();
				if (await project.optimizeImage(request, response, serveFile)) return true;
				const file = project.readEmittedFile(new URL(request.url, "http://n").pathname);
				if (!file) return false;
				response.setHeader("content-type", file.contentType);
				response.end(file.body);
				return true;
			};
			server.middlewares.use(async (request, response, next) => {
				let served;
				try {
					served = await serve(request, response);
				} catch (error) {
					server.config.logger.error(`vitest-plugin-rsc: ${request.url} failed. ${String(error)}`);
					response.statusCode = 500;
					response.end("Internal Server Error");
					return;
				}
				if (!served) next();
			});
		},
		async resolveId(source, importer, options) {
			if (source.startsWith(fontPrefix)) return source;
			if (fontRequest.test(source)) return `${fontPrefix}${Buffer.from(source).toString("base64url")}.js`;
			const layer = layerOf(this.environment.name);
			const candidates = layer && getProject().webpackAliasOf(source, layer);
			for (const candidate of candidates ?? []) {
				const resolved = await this.resolve(candidate, importer, {
					...options,
					skipSelf: true
				});
				if (resolved) return resolved;
			}
		},
		async load(id) {
			const built = (code, language) => {
				if (this.environment.mode !== "build") return code;
				const pathnames = getProject().emittedFiles().map((file) => file.pathname);
				return withBuiltFiles(code, pathnames, language);
			};
			if (id.startsWith(fontPrefix)) {
				const name = id.slice(29).split("?")[0];
				const key = name.replace(/\.(?:js|css)$/, "");
				const request = Buffer.from(key, "base64url").toString();
				const { css, exports } = await getProject().loadFont(request);
				if (name.endsWith(".css")) return built(css, "css");
				const stylesheet = linked(`${fontPrefix}${key}.css`, this.environment.mode === "build");
				return `import ${JSON.stringify(stylesheet)};\nexport default ${JSON.stringify(exports)};\n`;
			}
			const layer = layerOf(this.environment.name);
			if (!layer || id.includes("?")) return;
			if (getProject().webpackRuleOf(id, layer) && fs.existsSync(id)) return {
				code: await getProject().loadWithWebpackRule(id, layer),
				moduleType: "js"
			};
			if (!getProject().isImage(id) || !fs.existsSync(id)) return;
			return built(await getProject().loadImage(id), "js");
		},
		async transform(code, id) {
			const layer = layerOf(this.environment.name);
			if (!layer || id.includes("?")) return;
			if (!sourceFile.test(id) && !getProject().webpackRuleOf(id, layer)?.compile) return;
			if (!isAppCode(id, layer) || !fs.existsSync(id)) return;
			if (id.startsWith(`${normalizePath(this.environment.config.cacheDir)}/`)) return;
			const compiled = await getProject().compile(code, id, layer);
			return compiled && {
				code: compiled.code,
				map: compiled.map ?? null
			};
		}
	};
}
//#endregion
//#region src/nextjs/route-chunks.ts
/**
* For each route, by the ids of the modules it loads first, its entry and
* what its loader tree imports: the files of their chunks, the entry's first,
* and of every chunk those import, but none that `lists` and what they import
* are in, which the page has before it loads a route. Not the chunk of a
* module that one of them imports with `import()`: that is the app's to load.
*/
function routeChunksOf(bundle, lists, routes) {
	const chunkOf = /* @__PURE__ */ new Map();
	for (const output of Object.values(bundle)) {
		if (output.type !== "chunk") continue;
		for (const id of output.moduleIds) chunkOf.set(id, output);
	}
	const chunksOf = (ids, had = /* @__PURE__ */ new Set()) => {
		const loaded = /* @__PURE__ */ new Set();
		const visit = (chunk) => {
			if (!chunk || had.has(chunk.fileName) || loaded.has(chunk.fileName)) return;
			loaded.add(chunk.fileName);
			for (const fileName of chunk.imports) {
				const imported = bundle[fileName];
				if (imported?.type === "chunk") visit(imported);
			}
		};
		ids.forEach((id) => visit(chunkOf.get(id)));
		return loaded;
	};
	const had = chunksOf(lists);
	return new Map(Array.from(routes, ([route, ids]) => [route, [...chunksOf(ids, had)]]));
}
//#endregion
//#region src/nextjs/styles.ts
const linkedQuery = "next-linked";
const linkedRE = new RegExp(`[?&]${linkedQuery}\\b`);
const directRE = /[?&]direct\b/;
const transformOnly = "transform-only";
/** The id of a stylesheet that Next links, of the id of its file, in a build or not. */
const linked = (id, build = false) => `${id}${id.includes("?") ? "&" : "?"}${linkedQuery}${build ? `&${transformOnly}` : ""}`;
const isLinked = (id) => linkedRE.test(id);
const metaKey = "vitest-plugin-rsc:next-linked";
/**
* Whether a module is that of a stylesheet that Next links, whose links the
* page moves to the version of now after a change
* (`stylesheetsChangedEvent`). One without class names, which its module
* exports as a CSS module does, and so exports nothing. Not with
* `experimental.inlineCss`, with which Next puts the CSS of a page load in a
* `<style>`, which is no link: the page loads again for it.
*/
const movesItsLinks = (node) => (node.info?.meta)?.[metaKey]?.movesLinks === true;
/**
* Whether a stylesheet changes in place after a change, and what imports it
* sees nothing of it: one that accepts its own update, which Vite swaps as
* its `<style>`, and the module of a stylesheet that Next links without
* class names, whose links the page moves to the version of now
* (`stylesheetsChangedEvent`).
*/
const changesInPlace = (node) => isCSSRequest(node.url) && (node.isSelfAccepting === true || movesItsLinks(node));
const isScriptRequest = (source) => /\.[cm]?[jt]sx?$/.test(source);
const codeExtensionRE = /^(?:[cm]?[jt]sx?|vue|marko|svelte|astro|imba|mdx)$/;
function isCode$1(id, pageExtensions) {
	const file = id.split("?")[0];
	const extension = /\.([^./]+)$/.exec(file)?.[1];
	return extension === void 0 || codeExtensionRE.test(extension) || pageExtensions.some((pageExtension) => file.endsWith(`.${pageExtension}`));
}
/**
* The order of the cascade layers of a stylesheet, kept where Vite inlines
* its `@import`s. A layer comes in the order in which a stylesheet names it
* first, and an `@import` with `layer()` names it before an `@layer`
* statement that follows the import. `postcss-import`, with which Vite
* inlines an import, puts such a statement before the CSS of the import, so
* that its layers come first. With a statement of every layer of the imports
* at the top, which can precede an `@import`, the order is the stylesheet's
* own. Not that of a stylesheet it imports, which `postcss-import` reads
* itself, nor of a layer without a name, which a statement cannot name.
*/
function declareImportedLayers(css) {
	const layers = [];
	let start = 0;
	let importsLayer = false;
	let reordered = false;
	for (let at = 0;;) {
		const space = /^(?:\s+|\/\*[\s\S]*?\*\/)*/.exec(css.slice(at))[0];
		at += space.length;
		const rule = /^@(charset|import|layer)\b((?:"[^"]*"|'[^']*'|\([^)]*\)|[^;{"'(])*);/i.exec(css.slice(at));
		if (!rule) break;
		const [statement, name, prelude] = rule;
		at += statement.length;
		if (name.toLowerCase() === "charset") start = at;
		else if (name.toLowerCase() === "import") {
			const layer = /\blayer\(\s*([^)\s]+)\s*\)/i.exec(prelude.replace(/"[^"]*"|'[^']*'/g, ""));
			if (layer && !layers.includes(layer[1])) layers.push(layer[1]);
			importsLayer ||= Boolean(layer);
		} else {
			reordered ||= importsLayer;
			for (const layer of prelude.split(",").map((part) => part.trim())) if (layer && !layers.includes(layer)) layers.push(layer);
		}
	}
	if (!reordered) return css;
	return `${css.slice(0, start)}@layer ${layers.join(", ")};${css.slice(start)}`;
}
const directory = cssDirectory;
const versionRE = new RegExp(`^${directory}/(${cssVersionPattern})(/.*)$`);
function boundNames(node, names) {
	if (!node || typeof node !== "object") return;
	const { type } = node;
	if (type === "Identifier") names.add(node.name);
	else if (type === "ImportDeclaration") for (const { local } of node.specifiers) boundNames(local, names);
	else if (type === "VariableDeclaration") for (const { id } of node.declarations) boundNames(id, names);
	else if (type === "FunctionDeclaration" || type === "ClassDeclaration") boundNames(node.id, names);
	else for (const key of [
		"properties",
		"elements",
		"value",
		"argument",
		"left"
	]) for (const part of [node[key]].flat()) boundNames(part, names);
}
function identifiersOf(node, names) {
	if (!node || typeof node !== "object") return false;
	const { type } = node;
	if (type === "Identifier") names.add(node.name);
	let meta = type === "MetaProperty";
	for (const value of Object.values(node)) if (value && typeof value === "object") meta = identifiersOf(value, names) || meta;
	return meta;
}
/**
* The exports of Vite's module for a stylesheet, without the code that puts
* the CSS in the document.
*
* Vite's module for a client (`vite:css-post`) puts the CSS in a `<style>`,
* and has the class names of a CSS module as its exports, as Vite documents
* them. Its module for a server is those exports, with the constants they
* are made of: one for a class name that is no name of a variable, like
* `switch`. So the exports are kept, with the statements they use, and the
* rest is not. That holds as long as what they use is not the code of the
* `<style>`: an import, or `import.meta`.
*/
function exportsOfStylesheet(code, id) {
	const body = parseAst(code).body;
	const isExport = (node) => node.type === "ExportNamedDeclaration" && !node.source || node.type === "ExportDefaultDeclaration";
	const declaredBy = /* @__PURE__ */ new Map();
	for (const node of body) {
		if (isExport(node)) continue;
		const names = /* @__PURE__ */ new Set();
		boundNames(node, names);
		for (const name of names) declaredBy.set(name, node);
	}
	let other;
	const kept = new Set(body.filter(isExport));
	for (const node of kept) {
		const used = /* @__PURE__ */ new Set();
		if (identifiersOf(node, used)) other = code.slice(node.start, node.end);
		for (const name of used) {
			const declaration = declaredBy.get(name);
			if (!declaration || kept.has(declaration)) continue;
			if (declaration.type === "ImportDeclaration") other = name;
			else kept.add(declaration);
		}
	}
	for (const node of body) if (node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") {
		if (!kept.has(node)) other = code.slice(node.start, node.end);
	}
	if (other !== void 0) throw new Error(`vitest-plugin-rsc: vite@${version} differs from the Vite this plugin was written for: the exports of its module for the stylesheet ${id} need more than the class names (\`${other}\`). Use a version of vitest-plugin-rsc that supports vite@${version}.`);
	const exports = body.filter((node) => kept.has(node));
	return exports.length > 0 ? exports.map((node) => code.slice(node.start, node.end)).join("\n") : noExports;
}
const noExports = "export {}";
function createStyles(options) {
	const { getProject, environments } = options;
	const layers = new Map(Object.entries(environments).map(([layer, name]) => [name, layer]));
	const lists = new Set(options.lists);
	const inlinesCss = () => getProject().config.experimental?.inlineCss === true;
	const stylesheetIds = /* @__PURE__ */ new Map();
	function serveAt(stylesheet) {
		const url = stylesheet.url.split("?")[0];
		const name = url.startsWith("/") ? url : `/${createHash("sha1").update(url).digest("hex").slice(0, 16)}.css`;
		stylesheetIds.set(directory + name, stylesheet.id);
		return directory + name;
	}
	const segments = /* @__PURE__ */ new Map();
	function segmentsOf(route) {
		let files = segments.get(route);
		if (!files) {
			files = getProject().loadRouteEntry(route).then((entry) => entry.segments);
			segments.set(route, files);
			files.catch(() => segments.delete(route));
		}
		return files;
	}
	const loads = /* @__PURE__ */ new Map();
	function reach(vite) {
		const references = getPluginApi(vite.config)?.manager.clientReferenceMetaMap;
		if (!references) throw new Error("vitest-plugin-rsc: vitestPluginNext() needs vitestPluginRSC() before it in the plugins.");
		const graphs = {
			rsc: vite.environments[environments.rsc],
			browser: vite.environments[environments.browser]
		};
		const clientModules = /* @__PURE__ */ new Map();
		const followed = /* @__PURE__ */ new Set();
		const { pageExtensions = [] } = getProject().config;
		async function load(layer, url) {
			if (url.startsWith("/@id/")) url = url.slice(5).replace("__x00__", "\0");
			const key = `${layer}:${url}`;
			let loaded = loads.get(key);
			const node = await loaded?.module;
			if (node && node.lastInvalidationTimestamp !== loaded.invalidated) loaded = void 0;
			if (!loaded) {
				const loading = graphs[layer].transformRequest(url).then(() => graphs[layer].moduleGraph.getModuleByUrl(url)).catch((error) => {
					if (error?.code === "ERR_LOAD_URL") vite.config.logger.warnOnce(`vitest-plugin-rsc: the CSS of ${url} is not linked: ${String(error)}`);
				});
				loaded = {
					module: loading,
					invalidated: void 0
				};
				const entry = loaded;
				loading.then((found) => entry.invalidated = found?.lastInvalidationTimestamp);
				loads.set(key, loaded);
			}
			return loaded.module;
		}
		const isEnd = (id) => lists.has(id);
		/** Has Vite's graphs know what `node` imports, as far as it goes. */
		async function follow(layer, node) {
			if (followed.has(node) || !node.id || isEnd(node.id)) return;
			followed.add(node);
			const reference = layer === "rsc" ? clientReferenceOfModule(references, node.id) : void 0;
			if (reference) {
				const client = await load("browser", reference.importId);
				if (!client) return;
				clientModules.set(node, client);
				return follow("browser", client);
			}
			await Promise.all(Array.from(node.importedModules, async (imported) => {
				if (!imported.id || isCSSRequest(imported.id)) return;
				if (!isCode$1(imported.id, pageExtensions)) return;
				const loaded = imported.transformResult ? imported : await load(layer, imported.url);
				if (loaded) await follow(layer, loaded);
			}));
		}
		/** The stylesheets that `start` reaches, in the order of the imports. */
		function collect(start) {
			const paths = /* @__PURE__ */ new Set();
			const seen = /* @__PURE__ */ new Set();
			const visit = (node) => {
				if (seen.has(node) || !node.id || isEnd(node.id)) return;
				seen.add(node);
				const client = clientModules.get(node);
				if (client) return visit(client);
				for (const imported of node.importedModules) {
					if (!imported.id) continue;
					if (isLinked(imported.id)) paths.add(serveAt(imported));
					else if (!isCSSRequest(imported.id)) visit(imported);
				}
			};
			start.forEach(visit);
			return [...paths];
		}
		return {
			load,
			follow,
			collect
		};
	}
	/**
	* The stylesheets of a route, per file of a segment: see `Stylesheets`. The
	* node of a test is the page of its route, and no file: its stylesheets are
	* those of the files of the host that render it, `hostFiles` of
	* renderServer(), in their order. Under Vitest those are the setup files
	* and the test file; see `nodeFiles` in registry.ts. With `layouts: true`
	* the layouts of the app around it have their own.
	*/
	async function stylesheetsOf(vite, files, entry, inline) {
		const route = options.pageRoutes().get(entry);
		if (!route) return {};
		const { load, follow, collect } = reach(vite);
		const starts = /* @__PURE__ */ new Map();
		await Promise.all((await segmentsOf(route)).map(async ({ file, stylesheetsKey }) => {
			const node = await load("rsc", file);
			if (node) starts.set(stylesheetsKey, [node]);
		}));
		if ("component" in route) starts.set(componentPagePath, hostFileNodes(vite, files, "the files that render a node, `hostFiles` of renderServer() or its default under Vitest,"));
		await Promise.all([...starts.values()].flat().map((node) => follow("rsc", node)));
		const contentOf = async (path) => inline && inlinesCss() ? (await cssOf(vite, path))?.code : void 0;
		const fontsOf = async (path) => {
			const request = fontRequestOf(stylesheetIds.get(path) ?? "");
			return request === void 0 ? void 0 : (await getProject().loadFont(request)).files;
		};
		return Object.fromEntries(await Promise.all(Array.from(starts, async ([file, start]) => [file, await Promise.all(collect(start).map(async (path) => ({
			path: await versioned(vite, path),
			content: await contentOf(path),
			fonts: await fontsOf(path)
		})))])));
	}
	function hostFileNodes(vite, files, named) {
		const rsc = vite.environments[environments.rsc];
		return files.flatMap((file) => {
			if (!options.isHostFile(file)) {
				vite.config.logger.warnOnce(`vitest-plugin-rsc: ${named} name ${file}, which is neither a test file or setup file of Vitest nor matched by \`host.files\` of vitestPluginNext(); an in-source test file is a file of the app. Its stylesheets are not linked.`);
				return [];
			}
			const nodes = rsc.moduleGraph.getModulesByFile(file);
			if (!nodes?.size) vite.config.logger.warnOnce(`vitest-plugin-rsc: ${named} name ${file}, which the rsc layer has not loaded: the stylesheets it imports are not linked.`);
			return [...nodes ?? []];
		});
	}
	const fileOf = (file) => normalizePath(path.resolve(getProject().root, file));
	async function versioned(server, path) {
		const css = await cssOf(server, path).catch(() => null);
		return css ? `${directory}/${versionOf(css)}${path.slice(directory.length)}` : path;
	}
	/**
	* The stylesheets of the files of the host that the host uses,
	* `linkStylesheetsOf()`: what each imports, as for a file that renders a
	* node, in their order, each once. Such a use has no page of the app, so
	* the page links them itself: see client-graph.ts.
	*/
	async function hostFilesStylesheetsOf(vite, files) {
		const { follow, collect } = reach(vite);
		const nodes = hostFileNodes(vite, files, "`linkStylesheetsOf()`");
		await Promise.all(nodes.map((node) => follow("rsc", node)));
		return linkedAt(vite, collect(nodes));
	}
	function linkedAt(vite, paths) {
		const urlOf = (path) => path.split("/").map(encodeURIComponent).join("/");
		return Promise.all(paths.map(async (path) => getProject().assetPath + urlOf(await versioned(vite, path))));
	}
	function changedStylesheets(graph, modules) {
		const changed = /* @__PURE__ */ new Map();
		if (inlinesCss()) return changed;
		const reached = new Set(modules.flatMap((node) => [node, ...node.importers]));
		for (const [path, id] of stylesheetIds) {
			const css = graph.getModuleById(`${id}&direct`);
			if (!css?.isSelfAccepting || !reached.has(css)) continue;
			graph.invalidateModule(css);
			changed.set(path, css);
		}
		return changed;
	}
	async function cssOf(server, path) {
		const id = stylesheetIds.get(path);
		return id ? server.environments[environments.rsc].transformRequest(`${id}&direct`) : null;
	}
	const versions = /* @__PURE__ */ new WeakMap();
	function versionOf(css) {
		let version = versions.get(css);
		if (!version) {
			version = createHash("sha1").update(css.code).update(css.map?.mappings ?? "").digest("hex").slice(0, 16);
			versions.set(css, version);
		}
		return version;
	}
	async function serve(server, request, response) {
		const { assetPath } = getProject();
		const { pathname } = new URL(request.url, "http://n");
		if (!pathname.startsWith(`${assetPath}${directory}/`)) return false;
		let path;
		try {
			path = pathname.slice(assetPath.length).split("/").map(decodeURIComponent).join("/");
		} catch {
			return false;
		}
		const [, hash, rest] = versionRE.exec(path) ?? [];
		const version = hash && !stylesheetIds.has(path) && stylesheetIds.has(directory + rest) ? hash : void 0;
		if (version) path = directory + rest;
		const css = await cssOf(server, path);
		if (!css) return false;
		const current = versionOf(css);
		send(request, response, css.code, "css", {
			etag: `"${current}"`,
			cacheControl: version === current ? "public, max-age=31536000, immutable" : "no-cache",
			headers: server.config.server.headers,
			map: css.map
		});
		return true;
	}
	const built = createBuiltFiles(options, segmentsOf);
	return {
		plugins: [
			{
				name: "vitest-plugin-rsc:next-styles",
				enforce: "pre",
				configureServer(vite) {
					answerPage(vite, stylesheetsEvent, (question) => "hostFiles" in question ? hostFilesStylesheetsOf(vite, question.hostFiles.map(fileOf)) : stylesheetsOf(vite, question.files.map(fileOf), question.entry, question.inline));
					vite.watcher.on("all", () => {
						for (const [key, loaded] of loads) loaded.module.then((node) => {
							if (!node && loads.get(key) === loaded) loads.delete(key);
						});
					});
					vite.middlewares.use(async (request, response, next) => {
						let served;
						try {
							served = await serve(vite, request, response);
						} catch (error) {
							vite.config.logger.error(`vitest-plugin-rsc: ${request.url} failed. ${String(error)}`);
							response.statusCode = 500;
							response.end("Internal Server Error");
							return;
						}
						if (!served) next();
					});
				},
				hotUpdate: {
					order: "pre",
					async handler({ modules, server }) {
						if (!layers.has(this.environment.name)) return;
						const moved = /* @__PURE__ */ new Set();
						if (this.environment.name === environments.rsc) {
							const changed = changedStylesheets(this.environment.moduleGraph, modules);
							if (changed.size > 0) {
								const data = await linkedAt(server, [...changed.keys()]);
								this.environment.hot.send({
									type: "custom",
									event: stylesheetsChangedEvent,
									data
								});
							}
							for (const css of changed.values()) moved.add(css);
						}
						const updated = modules.filter((node) => !moved.has(node) && !movesItsLinks(node));
						if (updated.length < modules.length) return updated;
					}
				},
				async resolveId(source, importer, resolveOptions) {
					const layer = layers.get(this.environment.name);
					if (!layer || !importer || source.includes("?") || isScriptRequest(source)) return;
					const file = importer.split("?")[0];
					if (layer === "rsc" && !options.isServerCode(file) && !options.isHostFile(file)) return;
					const resolved = await this.resolve(source, importer, {
						...resolveOptions,
						skipSelf: true
					});
					if (!resolved || resolved.external || resolved.id.includes("?")) return resolved;
					if (!isCSSRequest(resolved.id)) return resolved;
					return {
						...resolved,
						id: linked(resolved.id, this.environment.mode === "build")
					};
				},
				transform(code, id) {
					if (!/\.css(?:$|\?)/.test(id) || /[?&](?:raw|url)\b/.test(id)) return;
					const declared = declareImportedLayers(code);
					if (declared !== code) return {
						code: declared,
						map: null
					};
				}
			},
			{
				name: "vitest-plugin-rsc:next-styles-module",
				enforce: "post",
				applyToEnvironment: (environment) => layers.has(environment.name),
				transform(code, id) {
					if (!isLinked(id) || directRE.test(id)) return;
					const exports = exportsOfStylesheet(code, id);
					const movesLinks = exports === noExports && !inlinesCss();
					return {
						code: exports,
						map: { mappings: "" },
						meta: { [metaKey]: { movesLinks } }
					};
				}
			},
			...built.plugins
		],
		builtFiles: built.files
	};
}
const realRoots = /* @__PURE__ */ new Map();
function realRootOf(root) {
	let real = realRoots.get(root);
	if (real === void 0) {
		real = fs.existsSync(root) ? normalizePath(fs.realpathSync(root)) : normalizePath(root);
		realRoots.set(root, real);
	}
	return real;
}
/**
* The key of a file of the host in `hostFiles` of `BuiltFiles`, by the
* id of its module in a build: its path from the root of the project, the
* same on every machine. Nothing for a file on another drive of Windows,
* which has no way from the root: its path is the machine's.
*/
function builtHostFileKey(id, root) {
	const file = normalizePath(path.relative(realRootOf(normalizePath(root)), id));
	return path.isAbsolute(file) ? void 0 : file;
}
/**
* The key of a module of a build, as `builtHostFileKey()` has it, when the
* module is a file of the host: matched by its path from the root, as
* `host.files` are from the root as the config has it. Nothing for a module
* that is no file, or one with a query.
*/
function builtHostFileOf(id, root, isHostFile) {
	if (id.startsWith("\0") || id.includes("?")) return void 0;
	const file = builtHostFileKey(id, root);
	if (file === void 0 || !isHostFile(path.posix.join(normalizePath(root), file))) return;
	return file;
}
const builtAssetRE = /__VITE_ASSET__([\w$]+)__/g;
const publicAssetRE = /__VITE_PUBLIC_ASSET__([a-z\d]{8})__/g;
const publicAssetHash = (url) => createHash("sha256").update(url).digest("hex").slice(0, 8);
const cssUrlRE = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]*))\s*\)|"(\/[^"]*)"|'(\/[^']*)'/g;
/**
* The stylesheets of a static build, which has no dev server to ask. So the
* build does what Next's build does: it writes each stylesheet into a file of
* its own under `/_next/static/css/`, and the stylesheets of every page route
* into a file next to the layers, which the page reads (`builtStylesheetsOf()`
* in styles-shared.ts).
*
* The CSS is what Vite's CSS plugin compiles the file into, with the files it
* names by the way from the stylesheet. Vite leaves a stylesheet that Next
* links out of the CSS of its chunks, see `linked()`: it is on the pages that
* link it, and only there. The lists are read off the module graphs of the
* build, as `reach()` reads them off the dev server's: the rsc layer for the
* files of the segments and the files of the host, and the layer of the
* browser for the Client Components, which is built after it. The node of a
* route has the stylesheets of the files of the host that the page names
* when it renders the node, as with the dev server: the build lists them
* for every file of the host it has, by its path from the root of the
* project, which is the same on every machine.
*
* The file also lists the modules of every page route, which a page load
* starts at once with the stylesheets: see route-chunks.ts.
*/
function createBuiltFiles(options, segmentsOf) {
	const { environments, getProject } = options;
	const lists = new Set(options.lists);
	const layerOf = (environment) => environment === environments.rsc ? "rsc" : environment === environments.browser ? "browser" : void 0;
	let manager;
	let publicDir = false;
	const key = (layer, id) => `${layer}\0${id}`;
	const compiled = /* @__PURE__ */ new Map();
	const files = /* @__PURE__ */ new Map();
	const fonts = /* @__PURE__ */ new Map();
	const routes = /* @__PURE__ */ new Map();
	const hostFiles = /* @__PURE__ */ new Map();
	const clients = /* @__PURE__ */ new Map();
	const modules = /* @__PURE__ */ new Map();
	const publicUrls = /* @__PURE__ */ new Map();
	let listed = false;
	const publicUrl = (hash) => {
		if (!listed) {
			listed = true;
			const files = publicDir ? fs.readdirSync(publicDir, { recursive: true }) : [];
			for (const file of files) {
				const url = `/${normalizePath(String(file))}`;
				publicUrls.set(publicAssetHash(url), url);
			}
		}
		return publicUrls.get(hash);
	};
	function importsIn(context) {
		const imports = /* @__PURE__ */ new Map();
		return (id) => {
			if (!imports.has(id)) {
				const info = context.getModuleInfo(id);
				imports.set(id, info ? [...info.importedIds, ...info.dynamicallyImportedIds] : void 0);
			}
			return imports.get(id);
		};
	}
	function reachIn(imports, starts, references = {}) {
		const reached = [];
		const seen = /* @__PURE__ */ new Set();
		const visit = (id) => {
			if (seen.has(id) || lists.has(id)) return;
			seen.add(id);
			const reference = references[id];
			if (reference) {
				reached.push({ client: reference.importId });
				return;
			}
			for (const imported of imports(id) ?? []) if (isLinked(imported)) reached.push({ stylesheet: imported });
			else if (!isCSSRequest(imported)) visit(imported);
		};
		starts.forEach(visit);
		return reached;
	}
	const plugin = {
		name: "vitest-plugin-rsc:next-styles-build",
		apply: "build",
		configResolved(config) {
			manager = getPluginApi(config)?.manager;
			publicDir = config.publicDir || false;
		},
		buildStart() {
			const layer = layerOf(this.environment.name);
			if (!layer || manager?.isScanBuild) return;
			for (const map of [compiled, files]) for (const id of map.keys()) if (id.startsWith(key(layer, ""))) map.delete(id);
			if (layer === "rsc") {
				routes.clear();
				hostFiles.clear();
				modules.clear();
			} else clients.clear();
		},
		transform(code, id) {
			const layer = layerOf(this.environment.name);
			if (!layer || manager?.isScanBuild || !isLinked(id) || directRE.test(id)) return;
			compiled.set(key(layer, id), code);
		},
		async buildEnd(error) {
			const layer = layerOf(this.environment.name);
			if (error || !layer || !manager || manager.isScanBuild) return;
			const imports = importsIn(this);
			if (layer === "rsc") {
				for (const [entry, route] of options.pageRoutes()) {
					const segments = /* @__PURE__ */ new Map();
					for (const { file, stylesheetsKey } of await segmentsOf(route)) {
						let id = normalizePath(file);
						if (!this.getModuleInfo(id) && fs.existsSync(file)) id = normalizePath(fs.realpathSync(file));
						const reached = reachIn(imports, [id], manager.clientReferenceMetaMap);
						segments.set(stylesheetsKey, reached);
					}
					if ("component" in route) segments.set(componentPagePath, []);
					routes.set(entry, segments);
				}
				const project = getProject();
				const { pageExtensions = [] } = project.config;
				for (const id of this.getModuleIds()) {
					if (!isCode$1(id, pageExtensions)) continue;
					const file = builtHostFileOf(id, project.root, options.isHostFile);
					if (file === void 0) continue;
					hostFiles.set(file, reachIn(imports, [id], manager.clientReferenceMetaMap));
				}
				return;
			}
			const stylesheetsOf = (reached) => reached.flatMap((item) => "stylesheet" in item ? [item.stylesheet] : []);
			const importer = `\0${clientReferencesId}`;
			const reached = [...[...routes.values()].flatMap((segments) => [...segments.values()]), ...hostFiles.values()];
			for (const item of reached.flat()) {
				if (!("client" in item) || clients.has(item.client)) continue;
				const resolved = await this.resolve(item.client, importer);
				clients.set(item.client, resolved ? stylesheetsOf(reachIn(imports, [resolved.id])) : []);
			}
		},
		async generateBundle(_options, bundle) {
			const layer = layerOf(this.environment.name);
			if (!layer || manager?.isScanBuild) return;
			if (layer === "rsc") {
				const routes = Array.from(options.pageRoutes().keys(), (route) => {
					const entry = options.entryIdOf(route);
					return [route, [entry, ...this.getModuleInfo(entry)?.dynamicallyImportedIds ?? []]];
				});
				for (const [route, chunks] of routeChunksOf(bundle, [...lists], routes)) modules.set(route, chunks);
			}
			const directory = `${getProject().assetPath.slice(1)}static/css/`;
			const toRoot = toBuildDir(`${directory}stylesheet.css`);
			for (const [id, css] of compiled) {
				if (!id.startsWith(key(layer, ""))) continue;
				const source = css.replace(builtAssetRE, (_, reference) => toRoot + this.getFileName(reference)).replace(publicAssetRE, (placeholder, hash) => {
					const url = publicUrl(hash);
					return url ? toRoot + url.slice(1) : placeholder;
				}).replaceAll(`${cssBuildDirPlaceholder}/`, toRoot);
				const file = id.slice(key(layer, "").length).split("?")[0];
				const name = file.startsWith("\0") ? "font" : path.basename(file).replace(/\.[^.]*$/, "");
				const hash = createHash("sha256").update(source).digest("hex").slice(0, 8);
				const fileName = `${directory}${name.replace(/[^\w.-]+/g, "_")}-${hash}.css`;
				this.emitFile({
					type: "asset",
					fileName,
					source
				});
				files.set(id, fileName);
				const request = fontRequestOf(file);
				if (request !== void 0) {
					const { files: fontFiles } = await getProject().loadFont(request);
					const assetDirectory = getProject().assetPath.slice(1);
					fonts.set(fileName, fontFiles.map((font) => assetDirectory + font));
				}
			}
		}
	};
	const urls = {
		name: "vitest-plugin-rsc:next-styles-build-urls",
		apply: "build",
		enforce: "pre",
		transform(code, id) {
			if (!layerOf(this.environment.name) || !isLinked(id) || directRE.test(id)) return;
			for (const match of code.matchAll(cssUrlRE)) {
				const url = match.slice(1).find((group) => group !== void 0).replace(/\\(\W)/g, "$1");
				if (!url.startsWith("/") || url.startsWith("//")) continue;
				try {
					const decoded = decodeURI(url);
					publicUrls.set(publicAssetHash(decoded), decoded);
				} catch {}
			}
		}
	};
	/**
	* The stylesheets of every page route and every file of the host, and the
	* modules of every page route, by the files of the build.
	*/
	function builtFiles() {
		if (routes.size === 0) return [];
		const built = {
			assetPath: getProject().assetPath,
			routes: {},
			hostFiles: {},
			chunks: [],
			modules: {},
			fonts: Object.fromEntries([...fonts].sort(([a], [b]) => a.localeCompare(b)))
		};
		const indexes = /* @__PURE__ */ new Map();
		for (const [route, chunks] of modules) built.modules[route] = chunks.map((chunk) => {
			if (!indexes.has(chunk)) indexes.set(chunk, built.chunks.push(chunk) - 1);
			return indexes.get(chunk);
		});
		const filesOf = (ids) => [...new Set(ids.flatMap((id) => files.get(id) ?? []))];
		const idsOf = (reached) => reached.flatMap((item) => "stylesheet" in item ? [key("rsc", item.stylesheet)] : (clients.get(item.client) ?? []).map((id) => key("browser", id)));
		for (const [entry, segments] of routes) built.routes[entry] = Object.fromEntries(Array.from(segments, ([segment, reached]) => [segment, filesOf(idsOf(reached))]));
		for (const file of [...hostFiles.keys()].sort()) built.hostFiles[file] = filesOf(idsOf(hostFiles.get(file)));
		return [{
			pathname: `/${builtFilesPath}`,
			body: Buffer.from(JSON.stringify(built))
		}];
	}
	return {
		plugins: [urls, plugin],
		files: builtFiles
	};
}
//#endregion
//#region src/nextjs/client-files.ts
const parsedFile = /\.(?:tsx|ts|mts|jsx|js|mjs)$/;
const languageOf = (file) => file.endsWith(".tsx") ? "tsx" : file.endsWith("ts") ? "ts" : "jsx";
const versionQuery = /^\?v=[\w.-]+$/;
/**
* The file that a module of Vite is, by its id: the id, without the version
* a dev server adds for a dependency. Nothing for an id with another query.
*/
function fileOfModule(id) {
	const query = id.indexOf("?");
	if (query === -1) return id;
	return versionQuery.test(id.slice(query)) ? id.slice(0, query) : void 0;
}
/**
* The client reference of a module of the rsc layer, in Vite RSC's map of
* them. With a dev server, Vite RSC has a module in `node_modules` there by
* its file, without the version, unless the page imports it by the name of
* its package.
*/
function clientReferenceOfModule(references, id) {
	const reference = references[id];
	if (reference) return reference;
	const file = fileOfModule(id);
	return file === void 0 ? void 0 : references[file];
}
/**
* What the module of the rsc layer for a file with `"use client"` starts
* with, in front of the reference module, which has none of the code of the
* file: the export `clientFileKeyExport` with the file's reference key, by
* which `loadClientModule()` tells the module, see client-file-key.ts. For a
* file of the host, `load`, also the line that loads the file in the browser
* layer by that key, see client-graph.ts. With a dev server the key is the
* URL of the file in the browser layer. In a build it is a hash.
*/
function clientFileCode({ referenceKey }, load) {
	const key = `export const ${clientFileKeyExport} = ${JSON.stringify(referenceKey)}; `;
	if (!load) return key;
	return `import { loadClientFile as __vitestPluginRscLoadClientFile } from ${JSON.stringify(load.internal)}; ` + key + `await __vitestPluginRscLoadClientFile(${JSON.stringify(referenceKey)}); `;
}
/** What `renderServer()` throws in a file with `"use client"`. */
const renderServerError = "vitest-plugin-rsc: renderServer() renders on the server, and this test file has \"use client\": it is client code, which cannot render server code. Render a Client Component with `render()` of vitest-browser-react or of @testing-library/react, or test a connected component with renderServer() in a test file without \"use client\".";
/** What the page imports for a module of the host: see ../host-module.ts. */
function hostModuleCode(target, testingLibrary) {
	if (target === testingLibrary.specifier) return `import * as module from ${JSON.stringify(testingLibrary.file)};\nexport default {\n  ...module,\n  async renderServer() {\n    throw new Error(${JSON.stringify(renderServerError)});\n  },\n};\n`;
	return `import * as module from ${JSON.stringify(target)};\nexport default module;\n`;
}
/**
* Three plugins. One that says which modules are Vitest's files, which Vite
* RSC makes a reference of last. Before Vite RSC: the modules of the page
* for the browser layer, the error for a file with `"use client"` that mocks
* a module, before Vite RSC drops the code of the file, and with a dev
* server the change of the file's module in the rsc layer for a change of
* what the file imports in the browser layer. After Vite RSC, which made the file a
* reference: the line in front of that module, with the file's reference
* key, which for a file of the host loads the file in the browser layer by
* that key. Not a file without the directive: a test file without it renders
* with `renderServer()`, in a page with a graph of its own.
*/
function clientFiles(options) {
	const { rsc, browser } = options.environments;
	const { testingLibrary, clientComponents, internal, isHostFile, isTestFile, isHostPackage } = options;
	const { clientReferenceOf } = options;
	const hostFileOf = (id) => {
		const file = fileOfModule(id);
		if (file === void 0 || !isHostFile(file)) return;
		return file;
	};
	return [
		{
			name: testFilesPlugin,
			api: { isModuleOfTestFile: (id) => {
				const file = fileOfModule(id);
				return file !== void 0 && isTestFile(file);
			} }
		},
		{
			name: "vitest-plugin-rsc:next-client-files",
			enforce: "pre",
			resolveId: {
				order: "pre",
				handler(source, importer) {
					if (source.startsWith("\0vitest-plugin-rsc/host-module/")) return source;
					if (this.environment.name !== browser) return;
					const { root } = this.environment.config;
					if (!importer || importer === path.posix.join(normalizePath(root), "index.html")) return;
					const entry = source === testingLibrary.specifier || source === clientComponents;
					if (isHostPackage(source) || entry) return this.environment.mode === "build" ? {
						id: builtHostModuleUrl(source),
						external: "absolute"
					} : hostModulePrefix + source;
				}
			},
			load(id) {
				if (!id.startsWith("\0vitest-plugin-rsc/host-module/")) return;
				const target = id.slice(hostModulePrefix.length);
				if (this.environment.name !== rsc) return "export {};";
				return hostModuleCode(target, testingLibrary);
			},
			async transform(code, id) {
				if (this.environment.name !== rsc || !code.includes("use client")) return;
				const file = hostFileOf(id);
				if (!file || !parsedFile.test(file)) return;
				const ast = await parseAstAsync(code, { lang: languageOf(file) });
				if (!hasDirective(ast.body, "use client")) return;
				const mocking = findMocking(ast);
				if (mocking) this.error(`vitest-plugin-rsc: ${file} calls ${mocking}(), which a file with "use client" cannot: it runs in the browser layer, and Vitest's mocker replaces the modules of the rsc layer. Mock in a setup file or a test file without the directive, or pass a mock as a prop.`);
			},
			hotUpdate: {
				order: "pre",
				handler({ file, modules, server }) {
					if (this.environment.name !== rsc) return;
					const changed = server.environments[browser]?.moduleGraph.getModulesByFile(file);
					if (!changed) return;
					const config = this.environment.getTopLevelConfig();
					const updated = new Set(modules);
					for (const hostFile of hostFilesImporting(changed, isHostFile)) for (const node of this.environment.moduleGraph.getModulesByFile(hostFile) ?? []) if (node.id && clientReferenceOf(node.id, config)) updated.add(node);
					if (updated.size > modules.length) return [...updated];
				}
			}
		},
		{
			name: "vitest-plugin-rsc:next-load-client-files",
			enforce: "post",
			configResolved({ plugins }) {
				const names = plugins.map(({ name }) => name);
				if (names.indexOf(testFileReferencesPlugin) > names.indexOf("vitest-plugin-rsc:next-load-client-files")) throw new Error("vitest-plugin-rsc: vitestPluginNext() needs vitestPluginRSC() before it in the plugins.");
			},
			transform(code, id) {
				if (this.environment.name !== rsc) return;
				const config = this.environment.getTopLevelConfig();
				const reference = clientReferenceOf(id, config);
				if (!reference) return;
				return {
					code: clientFileCode(reference, hostFileOf(id) ? { internal } : void 0) + code,
					map: null
				};
			}
		}
	];
}
/**
* The files of the host among `modules` and the modules that import them in
* a module graph, also through other modules. Not through a stylesheet whose
* links move to the version of now (`movesItsLinks()`).
*/
function hostFilesImporting(modules, isHostFile) {
	const files = /* @__PURE__ */ new Set();
	const seen = new Set(modules);
	for (const node of seen) {
		if (movesItsLinks(node)) continue;
		if (node.file && isHostFile(node.file)) files.add(node.file);
		for (const importer of node.importers) seen.add(importer);
	}
	return files;
}
const mockingCall = /^(?:vi|vitest)\.(?:mock|unmock|doMock|doUnmock|hoisted)$/;
/** The first call of the AST to a function of Vitest that mocks a module, like `vi.mock`. */
function findMocking(node) {
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = findMocking(child);
			if (found) return found;
		}
		return;
	}
	if (typeof node !== "object" || node === null) return;
	const { type, callee } = node;
	if (type === "CallExpression" && callee?.type === "MemberExpression" && !callee.computed && callee.object?.type === "Identifier" && callee.property?.type === "Identifier") {
		const name = `${callee.object.name}.${callee.property.name}`;
		if (mockingCall.test(name)) return name;
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === "parent" || typeof value !== "object") continue;
		const found = findMocking(value);
		if (found) return found;
	}
}
//#endregion
//#region src/nextjs/compat/paths.ts
/** The function a `"use cache"` function is compiled to call: see use-cache.ts. */
const cacheWrapper = "next/dist/build/webpack/loaders/next-flight-loader/cache-wrapper";
/**
* What the modules of this package import of Next in each layer, the modules
* of compat/rsc, compat/ssr, compat/server and compat/browser, and what the
* code that Vite and Vite RSC generate imports: plugin.ts pre-bundles them.
* Not what only `build: "production"` loads: `prerenderImports`.
*/
const runtimeImports$1 = {
	rsc: [
		"next/dist/server/route-kind",
		cacheWrapper,
		"next/dist/server/lib/server-ipc/utils",
		"next/dist/server/web/utils",
		"next/dist/shared/lib/no-fallback-error.external"
	],
	ssr: [
		"next/dist/server/route-modules/app-page/module",
		"next/dist/server/lib/incremental-cache",
		"next/dist/server/lib/incremental-cache/tags-manifest.external",
		"next/dist/server/lib/node-fs-methods",
		"next/dist/server/use-cache/handlers",
		"next/dist/lib/constants",
		"next/dist/shared/lib/page-path/normalize-page-path",
		"next/dist/client/components/app-router-headers",
		"next/dist/server/lib/server-action-request-meta",
		"next/dist/server/lib/is-rsc-request",
		"next/dist/shared/lib/router/utils/route-matcher",
		"next/dist/shared/lib/router/utils/route-regex",
		"next/dist/server/lib/server-ipc/utils",
		"next/dist/server/lib/mock-request",
		"next/dist/client/components/hooks-server-context",
		"next/dist/server/web/utils"
	],
	browser: [
		"next/dist/client/app-bootstrap",
		"next/dist/client/app-call-server",
		"next/dist/client/app-index",
		"next/dist/client/components/app-router",
		"next/dist/client/components/app-router-instance",
		"next/dist/client/components/router-reducer/create-initial-router-state",
		"next/dist/client/components/segment-cache/bfcache",
		"next/dist/client/components/segment-cache/cache",
		"next/dist/shared/lib/head-manager-context.shared-runtime"
	]
};
/**
* What rsc/prerender.ts imports, for the build's verdict on which pathnames
* of a route it prerenders: in the rsc layer, and only with
* `build: "production"`, the one run that loads it.
*/
const prerenderImports = [
	"next/dist/build/segment-config/app/app-segments",
	"next/dist/build/segment-config/app/collect-root-param-keys",
	"next/dist/build/static-paths/app",
	"next/dist/lib/fallback",
	"next/dist/lib/is-edge-runtime",
	"next/dist/lib/metadata/is-metadata-route",
	"next/dist/server/route-modules/app-route/helpers/is-static-gen-enabled",
	"next/dist/shared/lib/router/routes/app"
];
/** The module whose functions the shim of plugin.ts replaces, for Vite RSC's ids. */
const serverReferenceInfo = "next/dist/esm/shared/lib/server-reference-info.js";
/** The module of the asset prefix of Next's dev server, which plugin.ts gives none. */
const devAssetPrefix = /^next\/dist\/(esm\/)?client\/dev\/hot-reloader\/app\/asset-prefix(\.js)?$/;
/** Next's runtime of a page, which the entry of a page imports: see project/entries.ts. */
const appPageRuntime = "next/dist/build/templates/app-page-runtime";
/** Next's own boundaries, which the route of a node has at its root: see compat/checks.ts. */
const builtinBoundary = (name) => `next/dist/client/components/builtin/${name}.js`;
/** The loader of a font of `next/font`, `google` or `local`. */
const fontLoaderPath = (name) => `next/dist/compiled/@next/font/${name}/loader`;
/**
* React's Flight server, of the React that Next ships: the build for
* development and the one for production, of React and of its experimental
* channel. By the file.
*/
const vendoredFlightServer = /\/next\/dist\/compiled\/react-server-dom-webpack(?:-experimental)?\/cjs\/react-server-dom-webpack-server\.edge\.\w+\.js$/;
const nextModulesWithStores = [
	{
		layer: "rsc",
		module: "use-cache/use-cache-wrapper.js"
	},
	{
		layer: "ssr",
		module: "app-render/action-handler.js"
	},
	{
		layer: "ssr",
		module: "app-render/app-render.js"
	}
];
/** A module of `nextModulesWithStores`, in Next's ESM build. */
const withStoresId = (module) => `next/dist/esm/server/${module}`;
/** The modules of `nextModulesWithStores` by their file, of either build of Next's server. */
const withStoresFiles = (modules) => new RegExp(`/next/dist/(?:esm/)?server/(?:${modules.map((module) => module.replaceAll(".", "\\.")).join("|")})$`);
/**
* The modules of Next's Node.js server that node-platform.ts stands in for,
* by the name of the stand-in: each by its path in `next/dist`, without
* `esm/` and `.js`. compat/checks.ts checks that each is a file of the
* installed Next; an export its stand-in has not gets a stub.
*/
const nodePlatformModules = {
	"react-server-node": ["server/app-render/react-server.node"],
	"load-manifest": ["server/load-manifest.external"],
	"node-environment": [
		"server/node-environment",
		...[
			"error-inspect",
			"console-file",
			"console-exit",
			"console-dim.external",
			"unhandled-rejection.external",
			"random",
			"date",
			"web-crypto",
			"node-crypto",
			"process-error-handlers"
		].map((name) => `server/node-environment-extensions/${name}`),
		"build/adapter/setup-node-env.external"
	],
	"fast-set-immediate": ["server/node-environment-extensions/fast-set-immediate.external"],
	"gzip-size": ["compiled/gzip-size"],
	"vendored-react": ["server/route-modules/app-page/vendored/rsc/entrypoints", "server/route-modules/app-page/vendored/ssr/entrypoints"]
};
/**
* The module of `nodePlatformModules` a specifier is of: of either build of
* Next, with or without `.js`, or `/index.js` for a directory.
*/
function nodePlatformModuleOf(specifier) {
	return /^next\/dist\/(?:esm\/)?(.+?)(?:\/index)?(?:\.js)?$/.exec(specifier)?.[1];
}
/**
* The module of Next's server that loads the app's `instrumentation.ts`, by
* its path in `next/dist`: see node-platform.ts.
*/
const instrumentationModule = "server/lib/router-utils/instrumentation-globals.external";
/**
* What project/layers.ts adds to the alias tables of Next, as Next's build
* for Node.js and its module rules have it.
*/
const aliasPaths = {
	openTelemetry: "next/dist/compiled/@opentelemetry/api",
	/** Next's polyfill of a module of Node.js. */
	polyfill: (name) => `next/dist/compiled/${name}`,
	/** The route module of a kind, which Next's bundle for Node.js has as `module.compiled`. */
	routeModule: (kind) => `next/dist/server/route-modules/${kind}/module`,
	/** Next's own module for `react-dom/server`, of React's channel. */
	reactDomServer: (channel) => `next/dist/build/webpack/alias/react-dom-server${channel}.js`,
	/** React's server renderer for web streams, of its channel and its build. */
	reactDomServerEdge: (channel, build) => `next/dist/compiled/react-dom${channel}/cjs/react-dom-server.edge.${build}.js`,
	/** The contexts of Next's `*.shared-runtime` modules, of the bundle of its server. */
	vendoredContexts: "next/dist/server/route-modules/app-page/vendored/contexts",
	sharedRuntime: (name) => `next/dist/shared/lib/${name}.shared-runtime`
};
//#endregion
//#region src/nextjs/compat/patches.ts
const appRender = /\/next\/dist\/esm\/server\/app-render\/app-render\.js$/;
/**
* The patches of Next's files, with `registry` the expression of the registry
* in the code they add.
*/
const nextPatches = (registry) => [
	{
		file: appRender,
		lost: "`ssr: false` renders the HTML of the page anyway",
		edits: [["workUnitAsyncStorage.run(requestStore, renderToWebFizzStream, appElement, fizzOptions)", `workUnitAsyncStorage.run(requestStore, renderToWebFizzStream, ${registry}?.openedByRequest?.getStore()?.ssr === false ? _jsx("html", { id: "__next_error__", children: _jsx("body", {}) }) : appElement, fizzOptions)`]]
	},
	{
		file: /\/next\/dist\/esm\/client\/components\/app-router-instance\.js$/,
		lost: "fast mode cannot render a page in the kept app",
		edits: [["if (globalActionQueue !== null) {", `if (globalActionQueue !== null && !${registry}?.replacingRouter) {`]]
	},
	{
		file: /\/next\/dist\/compiled\/react-dom\/cjs\/react-dom-(?:client|profiling)\.development\.js$/,
		lost: "a page without HTML of the server warns of the `<script>` elements of the app",
		edits: [["didWarnScriptTags ||", `didWarnScriptTags || ${registry}?.fast?.keepApp || ${registry}?.opened?.ssr === false ||`]]
	}
];
//#endregion
//#region src/nextjs/node-builtins.ts
const ownFile$2 = fileURLToPath(import.meta.url);
const nodeDir = normalizePath(path.join(path.dirname(ownFile$2), path.extname(ownFile$2) === ".ts" ? "../../dist/node" : "../node")) + "/";
const extension = ".js";
const notHere = /* @__PURE__ */ new Set(["async_hooks"]);
const files = /* @__PURE__ */ new Map();
/**
* The file of the package's module for `source`, a module of Node.js with or
* without `node:`, if it has one: `.../node/fs.js` for `node:fs`.
*/
function nodeModuleOf(source) {
	if (!isBuiltin(source)) return;
	const name = source.replace(/^node:/, "");
	if (notHere.has(name)) return;
	if (!files.has(name)) {
		if (!fs.existsSync(nodeDir)) throw new Error(`vitest-plugin-rsc: no ${nodeDir}, the package is not built: run \`pnpm build\``);
		const file = `${nodeDir}${name}${extension}`;
		files.set(name, fs.existsSync(file) ? file : void 0);
	}
	return files.get(name);
}
/** Whether `id` is a file of the package's modules of Node.js. */
const isNodeModule = (id) => id.startsWith(nodeDir);
const browserFields = /* @__PURE__ */ new Map();
function browserFieldOf(dir) {
	if (browserFields.has(dir)) return browserFields.get(dir);
	let field;
	const file = path.join(dir, "package.json");
	const parent = path.dirname(dir);
	if (fs.existsSync(file)) {
		const { browser } = JSON.parse(fs.readFileSync(file, "utf8"));
		field = typeof browser === "object" && browser ? browser : {};
	} else if (parent !== dir) field = browserFieldOf(parent);
	browserFields.set(dir, field);
	return field;
}
/**
* What the package of `importer`, a dependency, says it uses for `source` in
* a browser, by its `browser` field: `false` for nothing, a file of its own
* as a string, or `undefined` where it says nothing. By the specifier as
* written: Vite maps `fs` and `node:fs` apart too.
*/
function browserMapping(source, importer) {
	const file = importer?.split("?")[0];
	if (!file || !path.isAbsolute(file) || !/[\\/]node_modules[\\/]/.test(file)) return;
	const mapping = browserFieldOf(path.dirname(file))?.[source];
	return mapping === false || typeof mapping === "string" ? mapping : void 0;
}
//#endregion
//#region src/nextjs/fast-crypto.ts
const ownFile$1 = fileURLToPath(import.meta.url);
const standInsFile = normalizePath(path.join(path.dirname(ownFile$1), path.extname(ownFile$1) === ".ts" ? "../../dist/fast-crypto/index.js" : "../fast-crypto/index.js"));
/** The file of the stand-ins, which the modules below import. */
function fastCryptoFile() {
	if (!fs.existsSync(standInsFile)) throw new Error(`vitest-plugin-rsc: no ${standInsFile}, the package is not built: run \`pnpm build\``);
	return standInsFile;
}
const packages = {
	bcryptjs: {
		factory: `bcrypt("bcryptjs")`,
		names: [
			"genSaltSync",
			"genSalt",
			"hashSync",
			"hash",
			"compareSync",
			"compare",
			"getRounds",
			"getSalt",
			"truncates",
			"encodeBase64",
			"decodeBase64",
			"setRandomFallback"
		],
		specifiers: ["bcryptjs"]
	},
	bcrypt: {
		factory: `bcrypt("bcrypt")`,
		names: [
			"genSaltSync",
			"genSalt",
			"hashSync",
			"hash",
			"compareSync",
			"compare",
			"getRounds"
		],
		specifiers: ["bcrypt"]
	},
	"node-rs-bcrypt": {
		factory: "nodeRsBcrypt()",
		names: [
			"DEFAULT_COST",
			"genSaltSync",
			"genSalt",
			"hashSync",
			"hash",
			"verifySync",
			"verify",
			"compareSync",
			"compare"
		],
		specifiers: ["@node-rs/bcrypt"]
	},
	argon2: {
		factory: "argon2()",
		names: [
			"argon2d",
			"argon2i",
			"argon2id",
			"hash",
			"verify",
			"needsRehash"
		],
		specifiers: ["argon2"]
	},
	"node-rs-argon2": {
		factory: "nodeRsArgon2()",
		names: [
			"Algorithm",
			"Version",
			"hash",
			"hashSync",
			"hashRaw",
			"hashRawSync",
			"verify",
			"verifySync"
		],
		specifiers: ["@node-rs/argon2"]
	},
	"noble-scrypt": {
		factory: "nobleScrypt()",
		names: ["scrypt", "scryptAsync"],
		specifiers: ["@noble/hashes/scrypt", "@noble/hashes/scrypt.js"]
	},
	"noble-pbkdf2": {
		factory: "noblePbkdf2()",
		names: ["pbkdf2", "pbkdf2Async"],
		specifiers: ["@noble/hashes/pbkdf2", "@noble/hashes/pbkdf2.js"]
	},
	"noble-argon2": {
		factory: "nobleArgon2()",
		names: [
			"argon2d",
			"argon2i",
			"argon2id",
			"argon2dAsync",
			"argon2iAsync",
			"argon2idAsync"
		],
		specifiers: ["@noble/hashes/argon2", "@noble/hashes/argon2.js"]
	}
};
const moduleOfSpecifier = new Map(Object.entries(packages).flatMap(([name, { specifiers }]) => specifiers.map((specifier) => [specifier, name])));
/**
* The name of the stand-in module for an import of a server layer, if it has
* one: a package that hashes passwords, or `node:crypto`, whose module is the
* plugin's own with the stand-ins in it, `nodeCryptoFile`.
*/
function fastCryptoModuleOf(source) {
	if (source === "crypto" || source === "node:crypto") return "node-crypto";
	return moduleOfSpecifier.get(source);
}
/**
* The code of a stand-in module by its name: for `node-crypto`, the plugin's
* `node:crypto`, the file `nodeCryptoFile`, with its `pbkdf2`, `scrypt` and
* `argon2` the stand-ins.
*/
function fastCryptoModule(name, nodeCryptoFile) {
	const from = JSON.stringify(fastCryptoFile());
	if (name === "node-crypto") {
		const own = JSON.stringify(nodeCryptoFile);
		return `import own from ${own};\nimport { Buffer } from "node:buffer";\nimport { nodeCrypto } from ${from};\nexport * from ${own};\nconst fast = nodeCrypto(Buffer);\nexport const { ${[
			"pbkdf2",
			"pbkdf2Sync",
			"scrypt",
			"scryptSync",
			"argon2",
			"argon2Sync"
		].join(", ")} } = fast;\nexport default { ...own, ...fast };\n`;
	}
	const standIn = packages[name];
	if (!standIn) return;
	return `import { ${standIn.factory.replace(/\(.*$/, "")} } from ${from};\nconst standIns = ${standIn.factory};\nexport const { ${standIn.names.join(", ")} } = standIns;\nexport default standIns;\n`;
}
/** The module of the setup file: Web Crypto's PBKDF2 a stand-in, or nothing. */
function fastCryptoSetup(enabled) {
	if (!enabled) return "export {};\n";
	return `import { installWebCrypto } from ${JSON.stringify(fastCryptoFile())};\ninstallWebCrypto();\n`;
}
//#endregion
//#region src/nextjs/fast-options.ts
const fastFeatures = [
	"keepApp",
	"skipPrefetch",
	"immediates",
	"watchDom",
	"cacheDevServer",
	"crypto"
];
/**
* The features of fast mode that `option`, the `fast` option, turns on:
* all of them for `true`, none for `false`, and for an object every one it
* does not set to `false`. Without the option, `VITEST_PLUGIN_RSC_FAST=1`
* of `env` is `true`.
*/
function resolveFast(option, env) {
	const fast = option ?? env.VITEST_PLUGIN_RSC_FAST === "1";
	return Object.fromEntries(fastFeatures.map((feature) => [feature, typeof fast === "object" ? fast[feature] !== false : fast]));
}
//#endregion
//#region src/nextjs/commonjs.ts
/**
* The export of a module compiled here that a `require()` of it returns: its
* `module.exports`. A name, as Vite RSC reads the exports of a `"use client"`
* module and takes no string for one.
*/
const moduleExports = "$$cjsModuleExports";
const requireHelper = `const $$cjsRequire = (ns) => ${JSON.stringify(moduleExports)} in ns ? ns[${JSON.stringify(moduleExports)}] : Object.prototype.toString.call(ns) === "[object Module]" || ns.__esModule ? ns : ns.default;\n`;
const missingHelper = "const $$cjsMissing = (source) => { throw Object.assign(new Error(`Cannot find module '${source}'`), { code: \"MODULE_NOT_FOUND\" }); };\n";
const defaultOnly = /\.(?:json|css|scss|sass|less|styl|stylus|pcss)(?:\?|$)/;
const isNode$1 = (value) => typeof value === "object" && value !== null && typeof value.type === "string";
function* walk(node, parent) {
	yield [node, parent];
	for (const key in node) {
		const value = node[key];
		for (const child of Array.isArray(value) ? value : [value]) if (isNode$1(child)) yield* walk(child, node);
	}
}
const isIdentifier = (node, name) => isNode$1(node) && node.type === "Identifier" && node.name === name;
const identifier = /^[A-Za-z_$][\w$]*$/;
/** Compiles CommonJS in a module into ES module code. Nothing for a module without it. */
async function compileCommonJs(code, { lang, resolves } = {}) {
	if (!/\brequire\s*\(|\bmodule\.exports\b|\bexports\.[\w$]+\s*=/.test(code)) return;
	const ast = await parseAstAsync(code, { lang });
	const requires = [];
	let ownRequire = false;
	let usesModule = false;
	const tried = /* @__PURE__ */ new Set();
	for (const [node] of walk(ast)) {
		if (node.type !== "TryStatement") continue;
		for (const [inner] of walk(node.block)) if (inner.type === "CallExpression") tried.add(inner);
	}
	for (const [node, parent] of walk(ast)) {
		if (isIdentifier(node, "module") || isIdentifier(node, "exports")) {
			if (!(parent?.type === "MemberExpression" && parent.property === node && !parent.computed || parent?.type === "Property" && parent.key === node && !parent.computed)) usesModule = true;
		}
		if (!isIdentifier(node, "require")) continue;
		const args = parent?.arguments;
		if (parent?.type === "CallExpression" && parent.callee === node) {
			const [source] = args ?? [];
			if (args?.length === 1 && source?.type === "Literal" && typeof source.value === "string") {
				requires.push({
					call: parent,
					source: source.value,
					tried: tried.has(parent)
				});
				continue;
			}
		}
		if (parent?.type === "MemberExpression" && parent.object === node) continue;
		ownRequire = true;
	}
	const isCommonJs = !ast.body.some((statement) => /^(?:Import|ExportNamed|ExportDefault|ExportAll)Declaration$/.test(statement.type)) && usesModule;
	if (ownRequire || requires.length === 0 && !isCommonJs) return;
	const output = new MagicString(code);
	const imports = /* @__PURE__ */ new Map();
	let missing = false;
	for (const { call, source, tried } of requires) {
		if (tried && resolves && !await resolves(source)) {
			missing = true;
			output.overwrite(call.start, call.end, `$$cjsMissing(${JSON.stringify(source)})`);
			continue;
		}
		let name = imports.get(source);
		if (!name) imports.set(source, name = `$$cjs${imports.size}`);
		const value = defaultOnly.test(source) ? `${name}.default` : `$$cjsRequire(${name})`;
		output.overwrite(call.start, call.end, value);
	}
	let header = [...imports].map(([source, name]) => `import * as ${name} from ${JSON.stringify(source)};\n`).join("");
	if ([...imports.keys()].some((source) => !defaultOnly.test(source))) header += requireHelper;
	if (missing) header += missingHelper;
	if (isCommonJs) {
		header += "var module = { exports: {} }, exports = module.exports;\n";
		let footer = `\nvar $$cjsExports = module.exports;\nexport { $$cjsExports as default, $$cjsExports as ${moduleExports} };\n`;
		await init();
		for (const name of new Set(parse(code).exports)) {
			if (!identifier.test(name) || name === "default") continue;
			footer += `var $$cjs_${name} = $$cjsExports.${name};\nexport { $$cjs_${name} as ${name} };\n`;
		}
		output.append(footer);
	}
	const afterDirectives = ast.body.find((statement) => !(statement.type === "ExpressionStatement" && "directive" in statement));
	if (afterDirectives) output.appendLeft(afterDirectives.start, header);
	else output.append(header);
	return {
		code: output.toString(),
		map: output.generateMap({ hires: "boundary" })
	};
}
function createCommonJsPlugin(layerOf, isAppCode) {
	return {
		name: "vitest-plugin-rsc:next-commonjs",
		enforce: "pre",
		async transform(code, id) {
			const layer = layerOf(this.environment.name);
			const file = id.split("?")[0];
			const extension = /\.[cm]?([jt]sx?)$/.exec(file);
			if (!layer || !extension || !isAppCode(file, layer)) return;
			return compileCommonJs(code, {
				lang: extension[1],
				resolves: async (source) => await this.resolve(source, id) !== null
			});
		}
	};
}
//#endregion
//#region src/nextjs/node-platform.ts
const newExportHelper = `const $$newExport = (message) => {
  const fail = () => { throw new Error(message); };
  return new Proxy(function () {}, {
    apply: fail,
    construct: fail,
    get: (_, key) =>
      typeof key === "symbol" || key === "__esModule" || key === "then" ? undefined : fail(),
  });
};
`;
function newExportStubs(newExports, version) {
	if (newExports.length === 0) return "";
	return newExportHelper + newExports.map(({ name, module }, index) => {
		const message = `vitest-plugin-rsc: next@${version} has \`${name}\` in ${module}, which the plugin's stand-in for that module does not have. Use a version of vitest-plugin-rsc that supports next@${version}.`;
		return `const $$new${index} = /* @__PURE__ */ $$newExport(${JSON.stringify(message)});\nexport { $$new${index} as ${JSON.stringify(name)} };\n`;
	}).join("");
}
/**
* The stand-ins, for a `registry` in the browser that some of them call and a
* `prefix` that their module ids start with.
*/
function createNodePlatform(registry, prefix) {
	const forward = (owner, names) => names.map((name) => `export const ${name} = (...args) => ${registry}.${owner}.${name}(...args);`).join("\n");
	const stagedRendering = `throw new Error(${JSON.stringify("vitest-plugin-rsc: Next's staged rendering, for Cache Components, is not supported.")});`;
	const modules = {
		"react-server-node": forward("flightServer", [
			"createTemporaryReferenceSet",
			"decodeReply",
			"decodeReplyFromBusboy",
			"decodeAction",
			"decodeFormState"
		]),
		"load-manifest": forward("node", [
			"loadManifest",
			"evalManifest",
			"loadManifestFromRelativePath",
			"evalManifestFromRelativePath"
		]) + `\nexport const clearManifestCache = () => false;`,
		"node-environment": `
  export const installProcessErrorHandlers = () => {};
  export const isUnhandledRejectionListenerRegistered = () => false;
  export const registerUnhandledRejectionListener = () => {};
  export const setAbortedLogsStyle = () => {};
  `,
		"vendored-react": `
  export const React = undefined;
  export const ReactDOM = undefined;
  export const ReactDOMServer = undefined;
  export const ReactJsxDevRuntime = undefined;
  export const ReactJsxRuntime = undefined;
  export const ReactCompilerRuntime = undefined;
  export const ReactServerDOMTurbopackClient = undefined;
  export const ReactServerDOMTurbopackServer = undefined;
  export const ReactServerDOMTurbopackStatic = undefined;
  export const ReactServerDOMWebpackClient = undefined;
  export const ReactServerDOMWebpackServer = undefined;
  export const ReactServerDOMWebpackStatic = undefined;
  `,
		"gzip-size": `
  export const sync = () => 0;
  export default { sync };
  `,
		"fast-set-immediate": `
  export const unpatchedSetImmediate = (...args) => ${registry}.setImmediate(...args);
  export function DANGEROUSLY_runPendingImmediatesAfterCurrentTask() {
    ${stagedRendering}
  }
  export function expectNoPendingImmediates() {}
  export class ImmediateTracker {
    constructor() {
      ${stagedRendering}
    }
  }
  export function runWithNativeImmediateTracking() {
    ${stagedRendering}
  }
  `,
		"ssr-app-page-module": `
  export const AppPageRouteModule = new Proxy(class {}, {
    construct: (_, args) => new ${registry}.ssr.AppPageRouteModule(...args),
  });
  export default AppPageRouteModule;
  export const vendored = new Proxy({}, {
    get: (_, key) => ${registry}.ssr.vendored[key],
  });
  ${forward("ssr", ["renderToHTMLOrFlight", "prerenderToHTMLOrFlight"])}
  `
	};
	const names = new Map(Object.entries(nodePlatformModules).flatMap(([name, nextModules]) => nextModules.map((nextModule) => [nextModule, name])));
	return {
		/** The id of the stand-in for a specifier of a server layer, if it has one. */
		moduleOf(source) {
			const name = names.get(nodePlatformModuleOf(source) ?? "");
			return name && prefix + name;
		},
		/**
		* The code of a stand-in, by its id without the prefix, with a stub for
		* each export of Next's module that it has not, of the installed `version`.
		*/
		load(name, newExports = [], version = "") {
			const code = modules[name];
			return code === void 0 ? void 0 : code + newExportStubs(newExports, version);
		}
	};
}
const missingRequire = "$$cjsMissing";
const hookFilename = "INSTRUMENTATION_HOOK_FILENAME";
/** The files of the module of Next that loads `instrumentation.ts`, of either build. */
const instrumentationFile = new RegExp(`/next/dist/(?:esm/)?${instrumentationModule.replaceAll(".", "\\.")}\\.js$`);
/**
* The code of the module of Next that loads `instrumentation.ts`, with a
* `require` that finds no file. Or why it cannot have one: its one use of
* `require` has to be a call that loads the file, or this is a Next that
* loads it otherwise.
*/
function instrumentationRequire(code) {
	const uses = [];
	for (const [node, parent] of walk(parseAst(code))) if (node.type === "Identifier" && node.name === "require") uses.push([node, parent]);
	const [use, call] = uses[0] ?? [];
	if (!(uses.length === 1 && call?.type === "CallExpression" && call.callee === use && [...walk(call)].some(([node]) => node.type === "Identifier" && node.name === hookFilename))) return `\`require\` ${uses.length === 1 ? "once" : `${uses.length} times`}, and not as the one call that loads \`${hookFilename}\``;
	const replaced = new MagicString(code);
	replaced.overwrite(use.start, use.end, missingRequire);
	return replaced.prepend(missingHelper);
}
/**
* Next's module that loads `instrumentation.ts`, with a `require` that finds
* no file: for the dependency optimizer of a server layer, and for a static
* build, which has no optimizer.
*/
function instrumentationPlugin() {
	return {
		name: "vitest-plugin-rsc:next-instrumentation",
		transform: {
			filter: { id: instrumentationFile },
			handler(code, id) {
				const replaced = instrumentationRequire(code);
				if (typeof replaced === "string") throw new Error(`vitest-plugin-rsc: ${id} has ${replaced}.`);
				return {
					code: replaced.toString(),
					map: replaced.generateMap({ hires: "boundary" })
				};
			}
		}
	};
}
//#endregion
//#region src/nextjs/compat/build.ts
/**
* The build code of the `next` that `projectRequire` finds. `fail` stops the
* run with what differs, and the version of that `next`.
*/
function loadNextBuild(projectRequire, fail) {
	const load = (id) => {
		let loaded;
		try {
			loaded = projectRequire(`${id}.js`);
		} catch (error) {
			return fail(`${id}.js does not load (${error.message})`, error);
		}
		return new Proxy(loaded, { get: (target, name) => target[name] !== void 0 ? target[name] : fail(`${id}.js has no export \`${String(name)}\``) });
	};
	const loadConfig = load("next/dist/server/config").default;
	const constants = load("next/constants");
	const { COMPILER_NAMES } = constants;
	const { APP_DIR_ALIAS, MIDDLEWARE_FILENAME, PROXY_FILENAME, WEBPACK_LAYERS, WEBPACK_RESOURCE_QUERIES } = load("next/dist/lib/constants");
	const { findPagesDir } = load("next/dist/lib/find-pages-dir");
	const { discoverRoutes, createPagesMapping } = load("next/dist/build/route-discovery");
	const { normalizeCatchAllRoutes } = load("next/dist/build/normalize-catchall-routes");
	const { normalizeAppPath, compareAppPaths, selectAppPageEntry } = load("next/dist/shared/lib/router/utils/app-paths");
	const { isAppRouteRoute } = load("next/dist/lib/is-app-route-route");
	const { isAppPageRoute } = load("next/dist/lib/is-app-page-route");
	const { findMissingCanonicalInterceptionRoutes } = load("next/dist/shared/lib/router/utils/interception-routes");
	const { MissingCanonicalInterceptionRoutesError } = load("next/dist/shared/lib/errors/missing-canonical-interception-routes-error");
	const { IncompatibleParallelRouteSlotsError } = load("next/dist/shared/lib/errors/incompatible-parallel-route-slots-error");
	const { UnmatchedAppPagesError } = load("next/dist/shared/lib/errors/unmatched-app-pages-error");
	const { generateBuildId } = load("next/dist/build/generate-build-id");
	const { getDefineEnv } = load("next/dist/build/define-env");
	const { getNextPublicEnvironmentVariables, getNextConfigEnv } = load("next/dist/lib/static-env");
	const { SUPPORTED_NATIVE_MODULES } = load("next/dist/build/webpack/plugins/middleware-plugin");
	const compilerAliases = load("next/dist/build/create-compiler-aliases");
	const { needsExperimentalReact } = load("next/dist/lib/needs-experimental-react");
	const { loadEntrypoint } = load("next/dist/build/load-entrypoint");
	const nextAppLoader = load("next/dist/build/webpack/loaders/next-app-loader/index").default;
	const { IncrementalCache } = load("next/dist/server/lib/incremental-cache/index");
	const swc = load("next/dist/build/swc/index");
	const { getLoaderSWCOptions } = load("next/dist/build/swc/options");
	const loadJsConfig = load("next/dist/build/load-jsconfig").default;
	const { getRSCModuleInformation, getAppPageStaticInfo } = load("next/dist/build/analysis/get-page-static-info");
	const { nextImageLoaderRegex } = load("next/dist/build/webpack-config");
	const nextImageLoader = load("next/dist/build/webpack/loaders/next-image-loader/index").default;
	const { getNextFontLoader } = load("next/dist/build/webpack/config/blocks/css/loaders/next-font");
	const { getPostCssPlugins } = load("next/dist/build/webpack/config/blocks/css/plugins");
	const { findConfig } = load("next/dist/lib/find-config");
	const { getCssModuleLoader } = load("next/dist/build/webpack/config/blocks/css/loaders/modules");
	const localByDefault = load("next/dist/compiled/postcss-modules-local-by-default/index");
	const { getSupportedBrowsers } = load("next/dist/build/get-supported-browsers");
	const nextFontLoader = load("next/dist/build/webpack/loaders/next-font-loader/index").default;
	const nextRootParamsLoader = load("next/dist/build/webpack/loaders/next-root-params-loader").default;
	const imageOptimizer = load("next/dist/server/image-optimizer");
	const loadCustomRoutes = load("next/dist/lib/load-custom-routes").default;
	const { generateInterceptionRoutesRewrites } = load("next/dist/lib/generate-interception-routes-rewrites");
	const { NEXT_URL } = load("next/dist/client/components/app-router-headers");
	const { generateRoutesManifest } = load("next/dist/build/generate-routes-manifest");
	const { handleBuildComplete } = load("next/dist/build/adapter/build-complete");
	const { Bundler } = load("next/dist/lib/bundler");
	const { getFilesInDir } = load("next/dist/lib/get-files-in-dir");
	const { PAGE_TYPES } = load("next/dist/lib/page-types");
	const rootPageType = PAGE_TYPES.ROOT ?? fail("next/dist/lib/page-types.js has no `PAGE_TYPES.ROOT`");
	const { getStaticInfoIncludingLayouts } = load("next/dist/build/get-static-info-including-layouts");
	const { getEdgeServerEntry } = load("next/dist/build/entries");
	const { getNamedMiddlewareRegex } = load("next/dist/shared/lib/router/utils/route-regex");
	const nextMiddlewareLoader = load("next/dist/build/webpack/loaders/next-middleware-loader").default;
	const { getContentType, getExtension } = load("next/dist/server/serve-static");
	const nextMetadataImageLoader = load("next/dist/build/webpack/loaders/next-metadata-image-loader").default;
	const nextMetadataRouteLoader = load("next/dist/build/webpack/loaders/next-metadata-route-loader").default;
	return {
		loadConfig,
		PHASE_PRODUCTION_BUILD: constants.PHASE_PRODUCTION_BUILD,
		findPagesDir,
		generateBuildId,
		COMPILER_NAMES,
		APP_DIR_ALIAS,
		MIDDLEWARE_FILENAME,
		PROXY_FILENAME,
		WEBPACK_LAYERS,
		WEBPACK_RESOURCE_QUERIES,
		discoverRoutes,
		createPagesMapping,
		normalizeCatchAllRoutes,
		normalizeAppPath,
		compareAppPaths,
		selectAppPageEntry,
		isAppRouteRoute,
		isAppPageRoute,
		findMissingCanonicalInterceptionRoutes,
		MissingCanonicalInterceptionRoutesError,
		IncompatibleParallelRouteSlotsError,
		UnmatchedAppPagesError,
		getDefineEnv,
		getNextPublicEnvironmentVariables,
		getNextConfigEnv,
		SUPPORTED_NATIVE_MODULES,
		compilerAliases,
		needsExperimentalReact,
		loadEntrypoint,
		nextAppLoader,
		IncrementalCache,
		swc,
		getLoaderSWCOptions,
		loadJsConfig,
		getRSCModuleInformation,
		getAppPageStaticInfo,
		nextImageLoaderRegex,
		nextImageLoader,
		getNextFontLoader,
		getPostCssPlugins,
		getSupportedBrowsers,
		getCssModuleLoader,
		localByDefault,
		findConfig,
		nextFontLoader,
		nextRootParamsLoader,
		imageOptimizer,
		loadCustomRoutes,
		generateInterceptionRoutesRewrites,
		NEXT_URL,
		generateRoutesManifest,
		handleBuildComplete,
		Bundler,
		getFilesInDir,
		rootPageType,
		getStaticInfoIncludingLayouts,
		getEdgeServerEntry,
		getNamedMiddlewareRegex,
		nextMiddlewareLoader,
		getContentType,
		getExtension,
		nextMetadataImageLoader,
		nextMetadataRouteLoader
	};
}
//#endregion
//#region src/nextjs/project/env.ts
/** Next's env files in its test mode. A name takes the value of the first file that has it. */
const testEnvFiles = [
	".env.test.local",
	".env.test",
	".env"
];
/** The env files that a run or a build reads, by their path from the root. */
function envFilesOf(build) {
	return build ? testEnvFiles.filter((file) => !file.endsWith(".local")) : testEnvFiles;
}
const isNextsOwn = (name) => name === "NODE_ENV" || name === "NEXT_RUNTIME" || name.startsWith("__NEXT_");
/**
* The env files of a run or a build, parsed by the project's `@next/env` in
* `envWorker`, a thread with `NODE_ENV=test` for all of its env: see
* env-worker.ts.
*/
async function readTestEnv(root, { nextEnv, envWorker, build }) {
	const files = envFilesOf(build).flatMap((file) => {
		const stats = fs.statSync(path.join(root, file), { throwIfNoEntry: false });
		return stats?.isFile() || stats?.isFIFO() ? [{
			path: file,
			contents: fs.readFileSync(path.join(root, file), "utf8"),
			env: {}
		}] : [];
	});
	if (files.length === 0) return {
		values: {},
		files: []
	};
	const worker = new Worker(envWorker, {
		env: { NODE_ENV: "test" },
		workerData: {
			nextEnv,
			root,
			files
		}
	});
	const parsed = await new Promise((resolve, reject) => {
		worker.once("message", resolve);
		worker.once("error", reject);
		worker.once("exit", (code) => reject(/* @__PURE__ */ new Error(`the thread exited with ${code}`)));
	});
	return {
		values: Object.fromEntries(Object.entries(parsed).filter(([name]) => !isNextsOwn(name))),
		files: files.map((file) => file.path)
	};
}
/**
* What the page's `process.env` gets: the test env, and `env` of
* `next.config`, which Next's `getNextConfigEnv()` gives as defines.
*/
function pageEnvOf(testEnv, configDefines) {
	const configEnv = Object.fromEntries(Object.entries(configDefines).map(([key, value]) => [key.slice(12), String(value)]));
	return {
		values: {
			...configEnv,
			...testEnv.values
		},
		files: testEnv.files,
		configNames: Object.keys(configEnv).filter((name) => !(name in testEnv.values))
	};
}
/**
* What a run or a build says of the env, once: the files it read, and in a
* build the names it bundles. Never a value.
*/
function describeEnv(env, build) {
	const files = env.files.length > 0 ? env.files.join(", ") : `no env file, as there is no ${envFilesOf(build).join(" or ")}`;
	if (!build) return `vitest-plugin-rsc: process.env of the app's server code is from ${files}`;
	const fileNames = Object.keys(env.values).filter((name) => !env.configNames.includes(name));
	return [
		`vitest-plugin-rsc: the build puts into the site the env of ${files}`,
		fileNames.length > 0 && `: ${fileNames.join(", ")}`,
		env.configNames.length > 0 && `; and env of next.config: ${env.configNames.join(", ")}`
	].filter(Boolean).join("");
}
//#endregion
//#region src/nextjs/project/context.ts
const workingDirectory = process.cwd();
let directoryQueue = Promise.resolve();
function inDirectory(directory, load) {
	const result = directoryQueue.then(async () => {
		process.chdir(directory);
		try {
			return await load();
		} finally {
			process.chdir(workingDirectory);
		}
	});
	directoryQueue = result.catch(() => {});
	return result;
}
/** The file of a module of Next by its path, which may leave out `.js` or `/index.js`. */
function moduleFileAt(base) {
	return [
		base,
		`${base}.js`,
		path.join(base, "index.js")
	].find((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile());
}
async function openNextProject(root, projectRequire, options) {
	const nextDir = path.dirname(projectRequire.resolve("next/package.json"));
	const { version } = projectRequire("next/package.json");
	const [major = 0, minor = 0] = version.split(".").map(Number);
	if (major < 16 || major === 16 && minor < 4) throw new Error(`vitest-plugin-rsc/nextjs needs next@16.4 or later, found next@${version}.`);
	const fail = (what, cause) => {
		throw new Error(`vitest-plugin-rsc: next@${version} differs from the Next.js this plugin was written for: ${what}. Use a version of vitest-plugin-rsc that supports next@${version}.`, { cause });
	};
	const replace = (code, piece, replacement, where) => {
		const replaced = code.replace(piece, replacement);
		return replaced === code ? fail(`${where} has no \`${piece}\` to replace`) : replaced;
	};
	const { loadConfig, PHASE_PRODUCTION_BUILD, findPagesDir, generateBuildId, ...next } = loadNextBuild(projectRequire, fail);
	let nextEnv;
	try {
		nextEnv = createRequire(path.join(nextDir, "package.json")).resolve("@next/env");
	} catch (error) {
		return fail(`@next/env is not found next to next (${error.message})`, error);
	}
	const readEnv = () => readTestEnv(root, {
		nextEnv,
		envWorker: options.envWorker,
		build: !!options.static
	}).catch((error) => {
		throw new Error(`vitest-plugin-rsc: the env files of ${root} do not load: ${error.message}`, { cause: error });
	});
	const testEnv = await readEnv();
	for (const [name, value] of Object.entries(testEnv.values)) process.env[name] ??= value;
	const loadedConfig = await inDirectory(root, () => loadConfig(PHASE_PRODUCTION_BUILD, root, { silent: true }));
	const config = {
		...loadedConfig,
		i18n: null,
		experimental: {
			...loadedConfig.experimental,
			cachedNavigations: false
		},
		...options.static && (loadedConfig.images?.loader ?? "default") === "default" && !loadedConfig.images?.loaderFile && { images: {
			...loadedConfig.images,
			unoptimized: true
		} }
	};
	const { appDir } = findPagesDir(root);
	if (!appDir) throw new Error(`vitest-plugin-rsc: no \`app\` directory found in ${root}`);
	const { pageExtensions } = config;
	const distDir = path.join(root, config.distDir);
	await next.swc.loadBindings(config.experimental.useWasmBinary);
	const buildId = await generateBuildId(config.generateBuildId, () => "vitest");
	const buildEnvironment = {
		__NEXT_BUILD_ID: buildId,
		__NEXT_PREVIEW_MODE_ID: "vitest-preview-mode-id",
		__NEXT_PREVIEW_MODE_SIGNING_KEY: "vitest-preview-mode-signing-key",
		__NEXT_PREVIEW_MODE_ENCRYPTION_KEY: "vitest-preview-mode-encryption-key".padEnd(64, "0")
	};
	const previewProps = {
		previewModeId: buildEnvironment.__NEXT_PREVIEW_MODE_ID,
		previewModeSigningKey: buildEnvironment.__NEXT_PREVIEW_MODE_SIGNING_KEY,
		previewModeEncryptionKey: buildEnvironment.__NEXT_PREVIEW_MODE_ENCRYPTION_KEY
	};
	return {
		root,
		/** What the page's `process.env` gets, see env.ts. */
		env: pageEnvOf(testEnv, next.getNextConfigEnv(config)),
		/** The env again, as the env files have it now. */
		loadEnv: async () => pageEnvOf(await readEnv(), next.getNextConfigEnv(config)),
		/** Finds `next`, and what the project has installed next to it. Not the global one. */
		projectRequire,
		nextDir,
		version,
		fail,
		replace,
		config,
		appDir,
		pageExtensions,
		distDir,
		buildId,
		buildEnvironment,
		previewProps,
		/** The build code of the installed `next`, see compat/build.ts. */
		next
	};
}
//#endregion
//#region src/nextjs/project/entries.ts
const loadOnce = "const __vitest_plugin_rsc_once__ = (load) => {\n  let loaded;\n  return () => (loaded ??= load().catch((error) => { loaded = undefined; throw error; }));\n};\n";
const segmentLoader = /\binstrumentModuleGetter\(\(\) => import\((\/\* webpackMode: "eager" \*\/ "(?:[^"\\]|\\.)*")\)\)/g;
function loadingOnce(code) {
	const once = code.replace(segmentLoader, "instrumentModuleGetter(__vitest_plugin_rsc_once__(() => import($1)))");
	return once === code ? code : loadOnce + once;
}
const componentRoot = "(vitest-plugin-rsc)";
const componentLayouts = "(vitest-plugin-rsc-layouts)";
const componentPage = `page: [__next_component__, ${JSON.stringify(componentPagePath)}]`;
const componentImport = `import { loadComponent as __next_component__ } from "vitest-plugin-rsc/nextjs/rsc";\n`;
function stripTurbopackTransitions(code) {
	return code.replace(/\s+with\s*\{\s*['"]turbopack-transition['"]\s*:\s*['"][^'"]*['"]\s*\}/g, "");
}
/**
* What the loader tree of a route names a file of it: its path from the root
* of the project, with `/`. Next looks up the stylesheets of a segment by that
* name without its extension (`RouteSegment`), with a dev server and in a
* build. Not the absolute path that Next's webpack build names it by: a static
* build has the tree in its files, which are then the same on every machine.
* Turbopack's names are from a root too, `[project]/app/page.tsx`.
*/
function nameInLoaderTree(root, file) {
	return normalizePath(path.relative(root, file));
}
const isLiteral = (node) => node?.type === "Literal";
function nameFiles(root, code) {
	const files = /* @__PURE__ */ new Set();
	const specifiers = /* @__PURE__ */ new Set();
	const strings = [];
	const visit = (node) => {
		if (!node || typeof node !== "object") return;
		const { type, source, callee, arguments: args } = node;
		const specifier = type === "CallExpression" && callee?.type === "Identifier" && callee.name === "require" ? args?.[0] : source;
		if (isLiteral(specifier) && typeof specifier.value === "string") {
			specifiers.add(specifier);
			if ((type === "ImportDeclaration" || type === "ImportExpression") && path.isAbsolute(specifier.value)) files.add(specifier.value);
		}
		if (isLiteral(node) && typeof node.value === "string") strings.push(node);
		for (const value of Object.values(node)) if (value && typeof value === "object") visit(value);
	};
	visit(parseAst(code));
	const names = strings.filter((string) => !specifiers.has(string) && files.has(string.value)).sort((a, b) => b.start - a.start);
	for (const { value, start, end } of names) {
		const name = JSON.stringify(nameInLoaderTree(root, value));
		code = code.slice(0, start) + name + code.slice(end);
	}
	return {
		code,
		segments: [...files].map((file) => ({
			file,
			stylesheetsKey: nameInLoaderTree(root, file).replace(/\.[^.]+$/, "")
		}))
	};
}
function routeEntries(context, { routes, appPathsPerRoute, strictRouteMatching, routeFile }, { middleware, middlewareFile }, builtinBoundaries, runLoader) {
	const { root, fail, replace, config, appDir, pageExtensions, buildId, next } = context;
	const { getEdgeServerEntry, loadEntrypoint, nextAppLoader, nextMiddlewareLoader, rootPageType } = next;
	const bindPageEntry = (code, where) => {
		code = replace(code, /\b__webpack_require__\b/g, "__next_require__", where);
		if (!code.includes(`"next/dist/build/templates/app-page-runtime"`) && !code.includes(`'next/dist/build/templates/app-page-runtime'`)) fail(`${where} has no \`${appPageRuntime}\``);
		return `import { requireModule as __next_require__ } from "vitest-plugin-rsc/nextjs/rsc";\n${code}`;
	};
	async function loadNodeEntry({ page, pathname }) {
		const segment = (name, children, modules = "{}") => `[${JSON.stringify(name)}, ${children}, ${modules}, null]`;
		let tree = `["__PAGE__", {}, { ${componentPage} }]`;
		for (const name of pathname.split("/").filter(Boolean).reverse()) tree = segment(name, `{ children: ${tree} }`);
		const boundaries = Object.entries(builtinBoundaries).map(([name, file]) => `${JSON.stringify(name)}: [() => import(${JSON.stringify(file)}), ${JSON.stringify(file)}]`);
		tree = segment(componentRoot, `{ children: ${tree} }`, `{ ${boundaries.join(", ")} }`);
		let code;
		try {
			code = await loadEntrypoint("app-page", {
				VAR_DEFINITION_PAGE: page,
				VAR_DEFINITION_PATHNAME: pathname
			}, {
				tree,
				__next_app_require__: "__webpack_require__",
				__next_app_load_chunk__: "() => Promise.resolve()"
			});
		} catch (error) {
			return fail(`the app-page template does not take the injections of next-app-loader (${error.message})`, error);
		}
		return componentImport + bindPageEntry(stripTurbopackTransitions(code), "the app-page template");
	}
	const compilation = {};
	const loadAppRouteEntry = async (route) => {
		const watchFiles = /* @__PURE__ */ new Set();
		const context = {
			getOptions: () => ({
				name: `app${route.page}`,
				page: route.page,
				pagePath: route.pagePath,
				appDir,
				appPaths: route.appPaths,
				allNormalizedAppPaths: Object.keys(appPathsPerRoute),
				pageExtensions,
				rootDir: root,
				basePath: config.basePath,
				assetPrefix: config.assetPrefix,
				nextConfigOutput: config.output ?? "",
				preferredRegion: void 0,
				middlewareConfig: Buffer.from("{}").toString("base64"),
				isGlobalNotFoundEnabled: config.experimental.globalNotFound || void 0,
				explicitParallelRouteChildren: config.experimental.explicitParallelRouteChildren || void 0,
				strictRouteMatching,
				isFinalRouteMatcher: strictRouteMatching
			}),
			_module: { buildInfo: {} },
			_compilation: compilation,
			_compiler: { context: root },
			addDependency: (file) => watchFiles.add(file),
			addMissingDependency: (file) => watchFiles.add(file),
			addContextDependency: () => {}
		};
		let code = stripTurbopackTransitions(await nextAppLoader.call(context));
		const where = "the output of next-app-loader";
		if (route.kind === "route") code = replace(code, /(\buserland: \(\)\s*=>\s*)require\(/, "$1import(", where);
		else code = bindPageEntry(code, where);
		const named = nameFiles(root, code);
		const pageFile = route.kind === "page" ? routeFile(route) : void 0;
		if (pageFile && !named.segments.some((segment) => segment.file === pageFile)) fail(`${where} no longer imports the module of a page by its file`);
		return {
			code: loadingOnce(named.code),
			watchFiles: [...watchFiles].filter((file) => fs.existsSync(file)),
			segments: route.kind === "page" ? named.segments : []
		};
	};
	return {
		componentRoutes: [...[.../* @__PURE__ */ new Set(["/", ...routes.map((route) => route.pathname)])].filter((pathname) => !/^\/_(not-found|global-error)$/.test(pathname)).map((pathname) => ({
			kind: "page",
			page: `${pathname === "/" ? "" : pathname}/page`,
			pathname,
			component: `${componentRoot}${pathname}`
		})), ...routes.filter((route) => route.kind === "page" && routeFile(route) && !route.page.includes("/@")).map((route) => ({
			kind: "page",
			page: route.page,
			pathname: route.pathname,
			component: `${componentLayouts}${route.page}`,
			layouts: true
		}))],
		async loadRouteEntry(route) {
			if (!("component" in route)) return loadAppRouteEntry(route);
			if (!route.layouts) return {
				code: await loadNodeEntry(route),
				watchFiles: [],
				segments: []
			};
			const appRoute = routes.find((candidate) => candidate.page === route.page);
			const pageFile = routeFile(appRoute);
			const file = JSON.stringify(nameInLoaderTree(root, pageFile)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const entry = await loadAppRouteEntry(appRoute);
			const code = replace(entry.code, new RegExp(`\\bpage: \\[\\w+, ${file}\\]`), componentPage, "the output of next-app-loader");
			return {
				code: componentImport + code,
				watchFiles: entry.watchFiles,
				segments: entry.segments.filter((segment) => segment.file !== pageFile)
			};
		},
		async loadMiddlewareEntry() {
			if (!middleware || !middlewareFile) return;
			const [loader, options = ""] = getEdgeServerEntry({
				rootDir: root,
				absolutePagePath: middleware.pagePath,
				buildId,
				bundlePath: middleware.page.slice(1),
				config,
				isDev: false,
				isServerComponent: false,
				page: middleware.page,
				pages: {},
				pagesType: rootPageType,
				middleware: middleware.staticInfo.middleware,
				middlewareConfig: middleware.staticInfo.middleware,
				preferredRegion: middleware.staticInfo.preferredRegion
			}).import.replace(/!$/, "").split("?");
			if (loader !== "next-middleware-loader") fail("`getEdgeServerEntry()` no longer loads the middleware with next-middleware-loader");
			const [code] = await runLoader(nextMiddlewareLoader, querystring.parse(options), middlewareFile);
			return replace(stripTurbopackTransitions(code), /\brequire\(/g, "await import(", "the middleware template");
		}
	};
}
//#endregion
//#region src/nextjs/project/layers.ts
/**
* What Next's build gives each layer: its compile-time constants and its
* module aliases. And the exports of the Flight codec of the rsc layer.
*/
async function layerTables(context, build) {
	const { root, nextDir, projectRequire, fail, config, appDir, pageExtensions, distDir, buildEnvironment, next } = context;
	const { SUPPORTED_NATIVE_MODULES, compilerAliases, getDefineEnv, getNextPublicEnvironmentVariables, getNextConfigEnv, needsExperimentalReact } = next;
	const definesFor = (layer) => {
		const envKeys = new Set(Object.keys({
			...getNextPublicEnvironmentVariables(),
			...getNextConfigEnv(config)
		}));
		const defines = getDefineEnv({
			isTurbopack: false,
			config,
			dev: false,
			distDir,
			projectPath: root,
			fetchCacheKeyPrefix: config.experimental.fetchCacheKeyPrefix,
			hasRewrites: false,
			isClient: layer === "browser",
			isEdgeServer: false,
			isNodeServer: layer !== "browser",
			clientRouterFilters: void 0,
			middlewareMatchers: void 0,
			rewrites: {
				beforeFiles: [],
				afterFiles: [],
				fallback: []
			}
		});
		if (layer !== "browser" && defines["process.env.NEXT_RUNTIME"] !== "\"nodejs\"") fail("`getDefineEnv()` does not define `process.env.NEXT_RUNTIME` as `nodejs`");
		if (layer !== "browser") defines["process.env.__NEXT_USE_NODE_STREAMS"] = "false";
		if ("process.env.__NEXT_RELATIVE_PROJECT_DIR" in defines) defines["process.env.__NEXT_RELATIVE_PROJECT_DIR"] = "\"\"";
		return {
			...layer !== "browser" && Object.fromEntries(Object.entries(buildEnvironment).map(([name, value]) => [`process.env.${name}`, JSON.stringify(value)])),
			...Object.fromEntries(Object.entries(defines).filter(([key, value]) => typeof value === "string" && !envKeys.has(key)))
		};
	};
	const appAliases = {
		rsc: {},
		ssr: {},
		browser: {}
	};
	const aliasesFor = (layer) => {
		const aliases = { "@opentelemetry/api$": aliasPaths.openTelemetry };
		if (layer === "browser") for (const name of SUPPORTED_NATIVE_MODULES) {
			if (name === "async_hooks") continue;
			aliases[`${name}$`] = aliases[`node:${name}$`] = aliasPaths.polyfill(name);
		}
		else {
			for (const kind of ["app-page", "app-route"]) {
				const file = aliasPaths.routeModule(kind);
				aliases[`${file}.compiled$`] = aliases[`${file}.compiled.js$`] = file;
			}
			for (const channel of ["", "-experimental"]) aliases[`${aliasPaths.reactDomServer(channel)}$`] = aliasPaths.reactDomServerEdge(channel, build);
		}
		const base = compilerAliases.createWebpackAliases({
			distDir,
			isClient: layer === "browser",
			isEdgeServer: layer !== "browser",
			dev: false,
			config,
			pagesDir: void 0,
			appDir,
			dir: root,
			reactProductionProfiling: false
		});
		for (const [key, target] of Object.entries(base)) aliases[key] = Array.isArray(target) ? target.find((candidate) => ["", ...pageExtensions.map((extension) => `.${extension}`)].some((extension) => path.isAbsolute(candidate) && fs.existsSync(candidate + extension))) ?? false : target;
		const channel = needsExperimentalReact(config) ? "-experimental" : "";
		const vendoredReactAliases = (isEdgeServer) => compilerAliases.createVendoredReactAliases(channel, {
			layer: layer === "browser" ? "app-pages-browser" : layer,
			isBrowser: layer === "browser",
			isEdgeServer,
			reactProductionProfiling: false
		});
		Object.assign(aliases, compilerAliases.createServerOnlyClientOnlyAliases(layer === "rsc"), vendoredReactAliases(layer !== "browser"), compilerAliases.createNextApiEsmAliases(), compilerAliases.createAppRouterApiAliases(layer === "rsc"));
		if (layer === "ssr") {
			const nodeTable = vendoredReactAliases(false);
			for (const key of ["react-dom/server$", "react-dom/static$"]) {
				const entry = nodeTable[key];
				if (typeof entry !== "string") return fail(`Next's alias table for Node.js has no \`${key}\``);
				appAliases[layer][key] = entry;
			}
		}
		if (typeof aliases["react-server-dom-webpack/server$"] !== "string") fail("the alias tables have no `react-server-dom-webpack/server$`");
		for (const { module } of nextModulesWithStores) {
			const id = withStoresId(module);
			try {
				projectRequire.resolve(id);
			} catch (error) {
				return fail(`${id} is not there`, error);
			}
		}
		if (layer === "rsc") {
			const contexts = aliasPaths.vendoredContexts;
			let files;
			try {
				files = fs.readdirSync(path.join(nextDir, contexts.slice(5)));
			} catch {
				return fail(`${contexts} is not there`);
			}
			const names = files.filter((file) => file.endsWith(".js") && file !== "entrypoints.js").map((file) => file.slice(0, -3));
			if (names.length === 0) fail(`${contexts} has no contexts`);
			for (const name of names) aliases[`${aliasPaths.sharedRuntime(name)}$`] = `${contexts}/${name}`;
		}
		return aliases;
	};
	const aliases = {
		rsc: aliasesFor("rsc"),
		ssr: aliasesFor("ssr"),
		browser: aliasesFor("browser")
	};
	await init();
	const exportsOf = (file) => {
		const { exports, reexports } = parse(fs.readFileSync(file, "utf8"));
		const requireFrom = createRequire(file);
		return [...exports.filter((name) => name !== "__esModule"), ...reexports.flatMap((reexport) => exportsOf(requireFrom.resolve(reexport)))];
	};
	const flightExports = {};
	for (const entry of Object.keys(rscFlightCodec)) {
		const specifier = `react-server-dom-webpack/${entry}`;
		const target = aliases.rsc[`${specifier}$`];
		if (typeof target !== "string") return fail(`the alias tables have no \`${specifier}$\``);
		try {
			flightExports[entry] = [...new Set(exportsOf(projectRequire.resolve(target)))];
		} catch (error) {
			return fail(`${target} cannot be read (${error.message})`, error);
		}
	}
	return {
		defines: {
			rsc: definesFor("rsc"),
			ssr: definesFor("ssr"),
			browser: definesFor("browser")
		},
		aliases,
		appAliases,
		flightExports
	};
}
//#endregion
//#region src/nextjs/project/module-exports.ts
function nameOf(node) {
	return "name" in node ? String(node.name) : "value" in node ? String(node.value) : "";
}
function bound(pattern, names) {
	if (!pattern || !("type" in pattern)) return;
	if (pattern.type === "Identifier") names.add(nameOf(pattern));
	for (const key of [
		"properties",
		"elements",
		"value",
		"argument",
		"left"
	]) {
		const child = pattern[key];
		for (const part of [child].flat()) if (typeof part === "object") bound(part, names);
	}
}
/**
* The names an ES module exports in its own code, `default` among them, and
* the modules of its `export *`. Of JavaScript, like Next's compiled files and
* the modules the plugin generates.
*/
function declaredExports(code) {
	const names = /* @__PURE__ */ new Set();
	const stars = [];
	for (const node of parseAst(code).body) if (node.type === "ExportDefaultDeclaration") names.add("default");
	else if (node.type === "ExportAllDeclaration") {
		if (node.exported) names.add(nameOf(node.exported));
		else stars.push(node.source.value);
	} else if (node.type === "ExportNamedDeclaration") {
		for (const specifier of node.specifiers) names.add(nameOf(specifier.exported));
		const { declaration } = node;
		if (declaration?.type === "VariableDeclaration") for (const { id } of declaration.declarations) bound(id, names);
		else if (declaration && "id" in declaration && declaration.id) names.add(nameOf(declaration.id));
	}
	return {
		names,
		stars
	};
}
/**
* What an ES module of Next exports: declared there, exported apart from its
* declaration, or from another module of Next with `export ... from` or
* `export *`. A module of CommonJS has none here.
*/
function exportNamesOf(file, seen = /* @__PURE__ */ new Set()) {
	if (seen.has(file)) return /* @__PURE__ */ new Set();
	seen.add(file);
	const { names, stars } = declaredExports(fs.readFileSync(file, "utf8"));
	for (const star of stars) {
		const from = star.startsWith(".") && moduleFileAt(path.resolve(path.dirname(file), star));
		if (!from) continue;
		for (const name of exportNamesOf(from, seen)) if (name !== "default") names.add(name);
	}
	return names;
}
/** Whether an ES module of Next exports a name: see `exportNamesOf()`. */
const hasExport = (file, name) => exportNamesOf(file).has(name);
/**
* What a module of the app exports, read off its code: the names, `default`
* among them, and the modules of its `export *`, whose names are theirs.
*/
async function exportsOf(code, file) {
	return declaredExports((await transformWithOxc(code, file, { sourcemap: false })).code);
}
async function exportStubs(code, file) {
	const { names, stars } = await exportsOf(code, file);
	const named = [...names].filter((name) => /^[\w$]+$/.test(name) && name !== "default");
	return (named.length > 0 ? `const _ = undefined;\nexport { ${named.map((name) => `_ as ${name}`).join(", ")} };\n` : "") + (names.has("default") ? "export default undefined;\n" : "") + stars.map((star) => `export * from ${JSON.stringify(star)};\n`).join("");
}
//#endregion
//#region src/nextjs/project/loaders.ts
function hasOtherPostCssConfig(root) {
	const names = (directory) => {
		try {
			return fs.readdirSync(directory);
		} catch {
			return [];
		}
	};
	return names(root).some((name) => /^(?:\.postcssrc(?:\..+)?|postcss\.config\..+)$/.test(name)) || names(path.join(root, ".config")).some((name) => name.startsWith("postcssrc"));
}
/**
* `sassOptions` of `next.config`, as Vite's options of Sass. Next gives
* sass-loader the options of Sass, and `additionalData`, or `prependData`,
* which goes before the source of each file, as it does for Vite. A path to
* load from is one of the project, where Next's build runs. Not
* `implementation`: Vite takes `sass-embedded` where it is installed, and
* `sass` otherwise.
*/
function sassPreprocessorOptions(sassOptions, root) {
	const { prependData, additionalData, implementation: _, loadPaths, ...options } = sassOptions;
	const data = prependData ?? additionalData;
	const sass = {
		...options,
		...Array.isArray(loadPaths) && { loadPaths: loadPaths.map((entry) => path.resolve(root, String(entry))) },
		...data !== void 0 && { additionalData: typeof data === "function" ? (source, file) => data(source, {
			resourcePath: file,
			rootContext: root
		}) : data }
	};
	return Object.keys(sass).length > 0 ? sass : void 0;
}
/**
* Next's webpack loaders for fonts and images, what they emit for the
* browser, and Next's image optimizer. `build` is the code that Next's
* runtime and React run, see build.ts.
*/
function createLoaders(context, build) {
	const { root, projectRequire, nextDir, fail, config, next } = context;
	const { COMPILER_NAMES, getContentType, getExtension, getNextFontLoader, getPostCssPlugins, getSupportedBrowsers, getCssModuleLoader, localByDefault, findConfig, imageOptimizer, nextFontLoader, nextRootParamsLoader, nextImageLoader, nextImageLoaderRegex } = next;
	const emitted = /* @__PURE__ */ new Map();
	const span = {
		traceChild: () => span,
		traceFn: (fn) => fn(),
		traceAsyncFn: (fn) => fn(),
		setAttribute: () => {}
	};
	const runLoaderEmitting = (emits) => (loader, options, resource, ...input) => new Promise((resolve, reject) => {
		const queryAt = resource.indexOf("?");
		const resourcePath = queryAt < 0 ? resource : resource.slice(0, queryAt);
		let callsBack = false;
		const callback = (error, ...result) => error ? reject(error) : resolve(result);
		const context = {
			getOptions: () => options ?? {},
			query: options ?? {},
			mode: build,
			_module: { buildInfo: {} },
			async: () => {
				callsBack = true;
				return callback;
			},
			callback: (...args) => {
				callsBack = true;
				callback(...args);
			},
			cacheable: () => {},
			currentTraceSpan: span,
			resourcePath,
			resourceQuery: queryAt < 0 ? "" : resource.slice(queryAt),
			context: path.dirname(resourcePath),
			rootContext: root,
			emitFile: (name, content) => {
				const file = name.replace(/^\//, "");
				emitted.set(file, content);
				emits?.(file);
			},
			emitWarning: (warning) => console.warn(warning),
			emitError: reject,
			addDependency: () => {},
			addContextDependency: () => {},
			resolve: (directory, request, callback) => {
				const file = path.resolve(directory, request);
				if (fs.existsSync(file)) callback(null, file);
				else callback(/* @__PURE__ */ new Error(`Can't resolve '${request}' in '${directory}'`));
			},
			getResolve: () => () => Promise.reject(/* @__PURE__ */ new Error("Not resolved by vitest-plugin-rsc")),
			loadModule: (request, respond) => {
				const read = async () => {
					const source = await fs.promises.readFile(request, "utf8");
					const { names } = await exportsOf(source, request);
					return {
						source,
						module: { dependencies: [...names].filter((name) => name !== "default").map((name) => ({
							constructor: { name: "HarmonyExportSpecifierDependency" },
							name
						})) }
					};
				};
				read().then(({ source, module }) => respond(null, source, null, module), (error) => respond(error));
			},
			fs,
			utils: { contextify: (_context, request) => request },
			sourceMap: false
		};
		Promise.resolve(loader.call(context, ...input)).then((result) => callsBack || resolve([result]), reject);
	});
	const runLoader = runLoaderEmitting();
	const resolve = (id) => {
		try {
			return projectRequire.resolve(id);
		} catch (error) {
			return fail(`${id} is not there`, error);
		}
	};
	let postcss;
	try {
		postcss = createRequire(path.join(nextDir, "package.json"))("postcss");
	} catch (error) {
		fail("it no longer depends on `postcss`", error);
	}
	const makeFontLoaders = () => ["google", "local"].map((name) => {
		const target = resolve(`next/font/${name}/target.css`);
		const loaders = getNextFontLoader({
			hasAppDir: true,
			isClient: true,
			isServer: false,
			isDevelopment: true,
			assetPrefix: config.assetPrefix,
			deploymentId: config.deploymentId,
			experimental: config.experimental
		}, async () => ({ postcss }), resolve(fontLoaderPath(name)));
		const cssLoader = loaders.find((entry) => entry.loader?.includes("css-loader"));
		const fontLoader = loaders.find((entry) => entry.loader === "next-font-loader");
		if (!cssLoader?.loader || !fontLoader) fail("`getNextFontLoader()` no longer uses css-loader and next-font-loader");
		return {
			prefix: `next/font/${name}/target.css?`,
			target,
			cssLoader: projectRequire(cssLoader.loader).default,
			cssOptions: cssLoader.options,
			fontOptions: fontLoader.options
		};
	});
	let fontLoaders;
	const fonts = /* @__PURE__ */ new Map();
	const loadFont = async (request) => {
		const font = (fontLoaders ??= makeFontLoaders()).find((candidate) => request.startsWith(candidate.prefix));
		const resource = font.target + request.slice(font.prefix.length - 1);
		const files = [];
		const [css, map, meta] = await runLoaderEmitting((file) => {
			if (/\.(?:woff|woff2|eot|ttf|otf)$/.test(file)) files.push(file);
		})(nextFontLoader, font.fontOptions, resource);
		const [code] = await runLoader(font.cssLoader, font.cssOptions, resource, css, map, meta);
		const cssModule = {
			id: resource,
			exports: {}
		};
		compileFunction(code, [
			"module",
			"exports",
			"require"
		])(cssModule, cssModule.exports, projectRequire);
		const list = cssModule.exports;
		if (!Array.isArray(list) || !list.locals) fail("css-loader no longer makes a list of CSS with `locals` of a `next/font` call");
		return {
			css: String(list),
			exports: list.locals,
			files
		};
	};
	const [cssModuleLoader] = getCssModuleLoader({
		isClient: false,
		isServer: true,
		hasAppDir: true,
		isAppDir: true,
		isDevelopment: false,
		experimental: {
			...config.experimental,
			useLightningcss: false
		}
	}, postcss).filter((entry) => entry.loader?.includes("css-loader"));
	const rule = cssModuleLoader?.options?.modules;
	const mode = typeof rule?.mode === "string" ? rule.mode : fail("`getCssModuleLoader()` no longer gives css-loader the `mode` of a CSS module");
	const getLocalIdent = typeof rule?.getLocalIdent === "function" ? rule.getLocalIdent : fail("`getCssModuleLoader()` no longer gives css-loader a `getLocalIdent`");
	const checkMode = {
		postcssPlugin: "vitest-plugin-rsc:next-css-module-mode",
		Once(root, { result, postcss: process }) {
			const file = (result.opts.from ?? "").split("?")[0];
			if (!/\.module\.(?:css|scss|sass)$/.test(file)) return;
			process([localByDefault({ mode })]).process(root.clone(), { from: file }).root;
		}
	};
	const loadCssOptions = async () => {
		const { experimental } = config;
		const differences = [];
		if (experimental.useLightningcss) differences.push("`experimental.useLightningcss` is not supported: the CSS is compiled with PostCSS");
		let postcss;
		if (await findConfig(root, "postcss") || !hasOtherPostCssConfig(root)) postcss = { plugins: [...await getPostCssPlugins(root, getSupportedBrowsers(root, false), experimental.disablePostcssPresetEnv), checkMode] };
		else differences.push("the app's PostCSS config is one only Vite reads: a CSS module is not held to Next's mode for it");
		const sass = sassPreprocessorOptions(config.sassOptions ?? {}, root);
		return {
			options: {
				postcss,
				...sass && { preprocessorOptions: {
					scss: sass,
					sass
				} },
				modules: { generateScopedName: (name, file) => getLocalIdent({
					rootContext: root,
					resourcePath: file.split("?")[0]
				}, void 0, name, { context: root }) }
			},
			differences
		};
	};
	const emittedPath = `${config.assetPrefix.startsWith("/") ? config.assetPrefix : ""}/_next/`;
	const { images } = config;
	return {
		runLoader,
		isImage: (file) => !images.disableStaticImages && nextImageLoaderRegex.test(file),
		async loadImage(file) {
			const options = {
				isDev: false,
				compilerType: COMPILER_NAMES.client,
				assetPrefix: config.assetPrefix,
				basePath: config.basePath,
				outputHashSalt: config.outputHashSalt
			};
			const [code] = await runLoader(nextImageLoader, options, file, await fs.promises.readFile(file));
			if (typeof code !== "string" || !code.startsWith("export default {")) fail("next-image-loader no longer exports the data of an image");
			return code;
		},
		loadCssOptions,
		loadFont(request) {
			let font = fonts.get(request);
			if (!font) {
				fonts.set(request, font = loadFont(request));
				font.catch(() => fonts.delete(request));
			}
			return font;
		},
		assetPath: emittedPath,
		async loadRootParams() {
			const options = {
				appDir: context.appDir,
				pageExtensions: config.pageExtensions
			};
			const [code] = await runLoader(nextRootParamsLoader, options, context.appDir);
			return String(code);
		},
		emittedFiles: () => [...emitted].map(([name, body]) => ({
			pathname: `${emittedPath}${name}`,
			body
		})),
		readEmittedFile(pathname) {
			if (!pathname.startsWith(emittedPath)) return;
			const name = pathname.slice(emittedPath.length);
			const body = emitted.get(name);
			if (!body) return;
			return {
				body,
				contentType: getContentType(path.extname(name).slice(1)) ?? ""
			};
		},
		async optimizeImage(request, response, serveFile) {
			const url = new URL(request.url, "http://n");
			if (url.pathname !== images.path) return false;
			if (images.loader !== "default" || images.unoptimized) {
				response.statusCode = 404;
				response.end();
				return true;
			}
			const { ImageOptimizerCache, ImageError } = imageOptimizer;
			const query = querystring.parse(url.search.slice(1));
			const params = ImageOptimizerCache.validateParams(request, query, config, false);
			if ("errorMessage" in params) {
				response.statusCode = 400;
				response.end(params.errorMessage);
				return true;
			}
			try {
				const upstream = params.isAbsolute ? await imageOptimizer.fetchExternalImage(params.href, images.dangerouslyAllowLocalIP, images.maximumResponseBody, images.maximumRedirects) : await imageOptimizer.fetchInternalImage(params.href, request, response, images.maximumResponseBody, serveFile);
				const { buffer, contentType, maxAge, etag } = await imageOptimizer.imageOptimizer(upstream, params, config, { isDev: false });
				imageOptimizer.sendResponse(request, response, params.href, getExtension(contentType), buffer, etag, params.isStatic, "MISS", images, maxAge, true);
			} catch (error) {
				if (!(error instanceof ImageError)) throw error;
				response.statusCode = error.statusCode;
				response.end(error.message);
			}
			return true;
		}
	};
}
//#endregion
//#region src/nextjs/project/metadata.ts
const metadataRequest = /^(next-metadata-(?:image|route)-loader)\?([^!]*)!(.*)$/;
function createMetadataLoaders(context, runLoader) {
	const { fail, replace, next } = context;
	const { nextMetadataImageLoader, nextMetadataRouteLoader, WEBPACK_RESOURCE_QUERIES } = next;
	return {
		metadataImageMeta: `?${WEBPACK_RESOURCE_QUERIES.metadataImageMeta}`,
		isMetadataRequest: (source) => metadataRequest.test(source),
		async loadMetadata(request) {
			const [, loader, query = "", resource = ""] = metadataRequest.exec(request) ?? fail(`${request} is no request for a metadata loader`);
			const options = querystring.parse(query);
			if (loader === "next-metadata-route-loader") {
				const file = String(options.filePath);
				let [code] = await runLoader(nextMetadataRouteLoader, options, resource);
				if (options.isDynamicRouteExtension !== "1" && process.env.NODE_ENV !== "production") code = replace(code, JSON.stringify("no-cache, no-store"), JSON.stringify("public, max-age=0, must-revalidate"), "the route of a static metadata file");
				return {
					code,
					watchFiles: [file]
				};
			}
			const file = resource.split("?")[0];
			const content = await fs.promises.readFile(file);
			const [code] = await runLoader(nextMetadataImageLoader, options, resource, content);
			return {
				code,
				watchFiles: [file]
			};
		}
	};
}
//#endregion
//#region src/nextjs/project/routes.ts
/**
* The routes of the app, the way `next build` lists its entries, and what
* `next build` rejects an app for.
*/
async function discoverAppRoutes(context) {
	const { root, fail, config, appDir, pageExtensions, next } = context;
	const { APP_DIR_ALIAS, IncompatibleParallelRouteSlotsError, MissingCanonicalInterceptionRoutesError, UnmatchedAppPagesError, compareAppPaths, discoverRoutes, findMissingCanonicalInterceptionRoutes, getAppPageStaticInfo, isAppPageRoute, isAppRouteRoute, normalizeAppPath, normalizeCatchAllRoutes, selectAppPageEntry } = next;
	const discovered = await discoverRoutes({
		appDir,
		pagesDir: void 0,
		pageExtensions,
		isDev: false,
		baseDir: root,
		isSrcDir: path.basename(path.dirname(appDir)) === "src"
	});
	const mappedAppPages = discovered.mappedAppPages ?? fail("`discoverRoutes()` returns no `mappedAppPages`");
	const appPathsPerRoute = {};
	for (const page of Object.keys(mappedAppPages)) (appPathsPerRoute[normalizeAppPath(page)] ??= []).push(page);
	const { strictRouteMatching: strict } = config.experimental;
	const strictRouteMatching = strict || void 0;
	const { unmatchedAppPages, incompatibleParallelRouteSlots } = normalizeCatchAllRoutes(appPathsPerRoute, {
		strictRouteMatching,
		defaultAppPaths: Object.keys(discovered.mappedAppDefaults ?? {})
	});
	const pagePathsPerRoute = Object.fromEntries(Object.entries(appPathsPerRoute).flatMap(([pathname, appPaths]) => {
		const pages = appPaths.filter(isAppPageRoute);
		return pages.length > 0 ? [[pathname, pages]] : [];
	}));
	const missingCanonical = strictRouteMatching ? findMissingCanonicalInterceptionRoutes(pagePathsPerRoute) : [];
	const routeErrors = [
		...missingCanonical.length > 0 ? [new MissingCanonicalInterceptionRoutesError(missingCanonical)] : [],
		...incompatibleParallelRouteSlots.length > 0 ? [new IncompatibleParallelRouteSlotsError(incompatibleParallelRouteSlots.map((slot) => ({
			...slot,
			layoutFile: path.relative(root, path.join(appDir, slot.layoutPath, "layout"))
		})))] : [],
		...unmatchedAppPages.length > 0 ? [new UnmatchedAppPagesError(unmatchedAppPages)] : []
	];
	if (routeErrors.length > 0) throw new Error(`vitest-plugin-rsc: \`next build\` fails on the routes of this app.\n\n` + routeErrors.map((error) => error.message).join("\n\n"));
	const fromRoot = (file) => path.relative(root, file).split(path.sep).join("/");
	const isRouteHandler = isAppRouteRoute;
	const routes = [];
	for (const [pathname, appPaths] of Object.entries(appPathsPerRoute)) {
		appPaths.sort(compareAppPaths);
		const page = selectAppPageEntry(pathname, appPaths);
		const pagePath = mappedAppPages[page];
		const own = appPaths.filter((appPath) => normalizeAppPath(appPath) === pathname);
		const pages = own.filter((appPath) => appPath.endsWith("/page"));
		const handlers = own.filter(isRouteHandler);
		if (pages.length > 0 && handlers.length > 0) throw new Error(`vitest-plugin-rsc: ${pathname} is both a page and a route handler (${pages.join(", ")} and ${handlers.join(", ")}). A path can only be one of them.`);
		const kind = page.endsWith("/page") ? "page" : isRouteHandler(page) ? "route" : void 0;
		if (kind) routes.push({
			kind,
			page,
			pathname,
			appPaths,
			pagePath
		});
	}
	const routeFile = (route) => route.pagePath.startsWith(APP_DIR_ALIAS) ? path.join(appDir, route.pagePath.slice(APP_DIR_ALIAS.length)) : void 0;
	for (const route of routes) {
		const file = routeFile(route);
		if (route.kind !== "page" || !file) continue;
		const hasLayout = (directory) => pageExtensions.some((extension) => fs.existsSync(path.join(directory, `layout.${extension}`))) || directory !== appDir && hasLayout(path.dirname(directory));
		if (!hasLayout(path.dirname(file))) throw new Error(`vitest-plugin-rsc: ${fromRoot(file)} does not have a root layout: there is no layout file in its directory or in one above it, up to the app directory. \`next build\` stops at that too.`);
	}
	const edgeRouteFiles = [];
	for (const route of routes) {
		const file = routeFile(route);
		if (!file) continue;
		const { runtime } = await getAppPageStaticInfo({
			pageFilePath: file,
			nextConfig: config,
			isDev: false,
			page: route.page,
			pageType: "app"
		});
		if (runtime === "edge") edgeRouteFiles.push(fromRoot(file));
	}
	return {
		routes,
		/** The pages of each route, by its pathname: a route can have a page in each of its slots. */
		appPathsPerRoute,
		strictRouteMatching,
		edgeRouteFiles,
		routeFile
	};
}
//#endregion
//#region src/nextjs/project/routing.ts
function urlPathname(pathname) {
	const url = new URL("http://localhost");
	url.pathname = pathname;
	return url.pathname;
}
function outputPagesOf(outputs, trailingSlash) {
	const pages = {};
	for (const { pathname, sourcePage } of [...outputs.appPages, ...outputs.appRoutes]) for (const requested of /* @__PURE__ */ new Set([pathname, urlPathname(pathname)])) {
		pages[requested] = sourcePage;
		if (trailingSlash && !requested.endsWith("/")) pages[`${requested}/`] = sourcePage;
	}
	return pages;
}
/**
* A rule of `headers()` in `next.config` with its `Set-Cookie` headers as
* one, joined with a comma. Next's build hands an adapter the headers of a
* rule as an object, one value per name, and `@next/routing` sets each on
* the response: the second cookie would be lost. `next start` sends every
* one. Joined, they are the way Next's build writes the `set-cookie` of a
* prerendered route, and `resolve()` in server-in-front.ts splits them
* again, with the split Next's `toNodeOutgoingHttpHeaders()` has for them.
*/
function joinSetCookies(rule) {
	const isCookie = ({ key }) => key.toLowerCase() === "set-cookie";
	const cookies = rule.headers.filter(isCookie);
	if (cookies.length < 2) return rule;
	const joined = {
		key: "Set-Cookie",
		value: cookies.map(({ value }) => value).join(", ")
	};
	return {
		...rule,
		headers: [...rule.headers.filter((header) => !isCookie(header)), joined]
	};
}
async function findMiddleware(context) {
	const { root, fail, config, appDir, pageExtensions, next } = context;
	const { MIDDLEWARE_FILENAME, PROXY_FILENAME, createPagesMapping, getFilesInDir, getStaticInfoIncludingLayouts, rootPageType } = next;
	const rootDir = path.dirname(appDir);
	const rootFiles = await getFilesInDir(rootDir);
	const middlewareFiles = [PROXY_FILENAME, MIDDLEWARE_FILENAME].flatMap((name) => {
		const file = pageExtensions.map((extension) => `${name}.${extension}`).find((candidate) => rootFiles.has(candidate));
		return file ? [path.join(rootDir, file)] : [];
	});
	if (middlewareFiles.length > 1) {
		const files = middlewareFiles.map((file) => path.relative(root, file));
		throw new Error(`vitest-plugin-rsc: the app has both ${files.join(" and ")}. Next.js takes one of them.`);
	}
	const [middlewareFile] = middlewareFiles;
	return {
		middlewareFile,
		middleware: middlewareFile ? await (async () => {
			const mapped = await createPagesMapping({
				isDev: false,
				pageExtensions,
				pagePaths: [middlewareFile.replace(root, "")],
				pagesType: rootPageType,
				pagesDir: void 0,
				appDir,
				appDirOnly: true
			});
			const [entry] = Object.entries(mapped);
			const [page, pagePath] = entry ?? fail(`\`createPagesMapping()\` has no page for ${middlewareFile}`);
			return {
				page,
				pagePath,
				staticInfo: await getStaticInfoIncludingLayouts({
					isInsideAppDir: false,
					pageExtensions,
					pageFilePath: middlewareFile,
					appDir,
					config,
					isDev: false,
					page
				})
			};
		})() : void 0
	};
}
/** `adapterPath` is the file of the adapter that Next's build hands the routes to: adapter.ts. */
async function buildRouting(context, { routes, appPathsPerRoute }, { middleware }, adapterPath) {
	const { root, projectRequire, version, fail, config, buildId, buildEnvironment, previewProps, next } = context;
	const { Bundler, NEXT_URL, generateInterceptionRoutesRewrites, generateRoutesManifest, getNamedMiddlewareRegex, handleBuildComplete, loadCustomRoutes } = next;
	let routingVersion;
	try {
		({version: routingVersion} = projectRequire("@next/routing/package.json"));
	} catch (error) {
		throw new Error(`vitest-plugin-rsc/nextjs needs @next/routing, the package of Next.js that resolves the route of a request. Install it at the version of next: @next/routing@${version}.`, { cause: error });
	}
	if (routingVersion !== version) throw new Error(`vitest-plugin-rsc/nextjs needs @next/routing at the version of next, and found @next/routing@${routingVersion} next to next@${version}. Install @next/routing@${version}.`);
	const edgeFunction = (name, page, matchers = []) => ({
		name,
		page,
		matchers,
		env: buildEnvironment,
		entrypoint: "",
		files: [],
		wasm: [],
		assets: []
	});
	const middlewareManifest = {
		version: 3,
		sortedMiddleware: middleware ? ["/"] : [],
		middleware: middleware ? { "/": edgeFunction(middleware.page.slice(1), "/", middleware.staticInfo.middleware?.matchers ?? [{
			regexp: getNamedMiddlewareRegex("/", { catchAll: true }).namedRegex,
			originalSource: "/:path*"
		}]) } : {},
		functions: Object.fromEntries(routes.map((route) => [route.page, edgeFunction(`app${route.page}`, route.page)]))
	};
	const routedConfig = {
		...config,
		output: void 0
	};
	const { built, routesManifest } = await inDirectory(root, async () => {
		const custom = await loadCustomRoutes(routedConfig);
		const { redirects, rewrites } = custom;
		const headers = custom.headers.map(joinSetCookies);
		const onMatchHeaders = custom.onMatchHeaders.map(joinSetCookies);
		const appPaths = Object.keys(appPathsPerRoute);
		rewrites.beforeFiles.push(...generateInterceptionRoutesRewrites(appPaths, config.basePath));
		const { routesManifest } = generateRoutesManifest({
			appType: "app",
			pageKeys: {
				pages: [],
				app: appPaths
			},
			config: routedConfig,
			redirects,
			headers,
			onMatchHeaders,
			rewrites,
			restrictedRedirectPaths: [`${config.basePath}/_next`],
			isAppPPREnabled: Boolean(config.cacheComponents),
			deploymentId: config.deploymentId
		});
		const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-"));
		fs.mkdirSync(path.join(buildDir, "static"));
		const { log } = console;
		console.log = (...message) => {
			if (!String(message[0]).includes("onBuildComplete")) log(...message);
		};
		try {
			return {
				built: await new Promise((resolve, reject) => {
					receivers.set(buildDir, resolve);
					handleBuildComplete({
						adapterPath,
						dir: root,
						distDir: buildDir,
						configOutDir: path.join(root, "out"),
						repoRoot: config.repoRoot,
						outputFileTracingRoot: config.outputFileTracingRoot || root,
						config: routedConfig,
						appType: "app",
						buildId,
						nextVersion: version,
						bundler: Bundler.Turbopack,
						routesManifest,
						middlewareManifest,
						prerenderManifest: {
							version: 4,
							routes: {},
							dynamicRoutes: {},
							notFoundRoutes: [],
							preview: previewProps
						},
						functionsConfigManifest: {
							version: 1,
							functions: {}
						},
						previewProps,
						pageKeys: [],
						appPageKeys: routes.map((route) => route.page),
						staticPages: /* @__PURE__ */ new Set(),
						serverPropsPages: /* @__PURE__ */ new Set(),
						requiredServerFiles: [],
						hasNodeMiddleware: false,
						hasInstrumentationHook: false,
						hasStatic404: false,
						hasStatic500: false
					}).then(() => reject(/* @__PURE__ */ new Error("it does not call `onBuildComplete` of the adapter")), reject);
				}),
				routesManifest
			};
		} catch (error) {
			return fail(`\`handleBuildComplete()\` does not hand an adapter the routes of an app without a build on disk (${error.message})`, error);
		} finally {
			console.log = log;
			receivers.delete(buildDir);
			fs.rmSync(buildDir, {
				recursive: true,
				force: true
			});
		}
	});
	for (const phase of [
		"beforeMiddleware",
		"beforeFiles",
		"afterFiles",
		"dynamicRoutes",
		"onMatch",
		"fallback"
	]) if (!Array.isArray(built.routing?.[phase])) fail(`\`handleBuildComplete()\` hands an adapter no \`routing.${phase}\``);
	const routing = {
		appRoutes: {
			...built.routing,
			beforeMiddleware: [],
			middlewareMatchers: [],
			beforeFiles: built.routing.beforeFiles.filter((route) => route.has?.some((has) => has.type === "header" && has.key.toLowerCase() === NEXT_URL)),
			afterFiles: [],
			fallback: []
		},
		routes: built.routing,
		basePath: config.basePath,
		buildId,
		outputs: outputPagesOf(built.outputs, config.trailingSlash)
	};
	const { resolveRoutes } = projectRequire("@next/routing");
	const outputPages = new Set(Object.values(routing.outputs));
	const unmatchedRoutes = [];
	for (const route of routes) {
		if (!outputPages.has(route.page)) fail(`\`handleBuildComplete()\` has no output for ${route.page}`);
		const isDynamic = route.pathname.includes("[");
		const sample = route.pathname.replace(/\[\[?(?:\.\.\.)?[^\]]+\]\]?/g, "-x-");
		const pathname = config.basePath + (sample === "/" && config.basePath ? "" : sample);
		const url = new URL("http://localhost");
		url.pathname = pathname;
		if (isDynamic && url.pathname !== pathname) {
			unmatchedRoutes.push(route.pathname);
			continue;
		}
		const resolved = await resolveRoutes({
			url,
			headers: new Headers(),
			requestBody: new ReadableStream(),
			basePath: routing.basePath,
			buildId: routing.buildId,
			pathnames: Object.keys(routing.outputs),
			routes: routing.appRoutes,
			invokeMiddleware: async () => ({})
		});
		const page = routing.outputs[resolved.resolvedPathname ?? ""];
		if (isDynamic ? page === void 0 : page !== route.page) fail(`\`resolveRoutes()\` of @next/routing@${routingVersion} does not find ${route.pathname} in the routes that \`handleBuildComplete()\` hands an adapter`);
	}
	return {
		routing,
		routesManifest,
		unmatchedRoutes
	};
}
//#endregion
//#region src/nextjs/compat/checks.ts
/**
* What the modules of this package in the browser assume about Next's runtime.
* Returns the files of Next's own boundaries, for the route of a node.
*/
function checkRuntime(context) {
	const { projectRequire, fail, previewProps, next } = context;
	const { IncrementalCache } = next;
	const cache = new IncrementalCache({
		fs: {},
		serverDistDir: "/.next/server",
		dev: false,
		requestHeaders: {},
		fetchCacheKeyPrefix: "prefix",
		previewProps,
		prerenderManifest: {
			version: 4,
			routes: {},
			dynamicRoutes: {},
			notFoundRoutes: [],
			preview: previewProps
		}
	});
	if (!cache.cacheHandler || cache.fetchCacheKeyPrefix !== "prefix") fail("`IncrementalCache` no longer takes `fs`, `serverDistDir` and `fetchCacheKeyPrefix`");
	const withoutWhitespace = (code) => code.replace(/\s+/g, "");
	const runtimeFile = (file) => {
		const id = `next/dist/esm/${file}.js`;
		let resolved;
		let code;
		try {
			resolved = projectRequire.resolve(id);
			code = fs.readFileSync(resolved, "utf8");
		} catch (error) {
			return fail(`${id} is not there`, error);
		}
		let compact;
		return {
			code,
			export: (name) => {
				if (!hasExport(resolved, name)) fail(`${id} has no export \`${name}\``);
			},
			contains: (...pieces) => {
				for (const piece of pieces) if (!code.includes(piece)) fail(`${id} has no \`${piece}\``);
			},
			containsCode: (...pieces) => {
				compact ??= withoutWhitespace(code);
				for (const piece of pieces) if (!compact.includes(withoutWhitespace(piece))) fail(`${id} has no \`${piece}\``);
			},
			matches: (pattern, what) => {
				if (!pattern.test(code)) fail(`${id} has no ${what}`);
			}
		};
	};
	const appIndex = runtimeFile("client/app-index");
	appIndex.export("hydrate");
	appIndex.contains("process.env.__NEXT_TEST_MODE", "__NEXT_HYDRATED_CB");
	const builtinBoundaries = Object.fromEntries([
		"global-error",
		"not-found",
		"forbidden",
		"unauthorized"
	].map((name) => {
		const file = builtinBoundary(name);
		try {
			projectRequire.resolve(file);
		} catch (error) {
			fail(`${file} is not there`, error);
		}
		return [name, file];
	}));
	appIndex.contains("const appElement = document", "ReactDOMClient.hydrateRoot(appElement", "ReactDOMClient.createRoot(appElement");
	for (const name of ["onCaughtError", "onUncaughtError"]) appIndex.matches(new RegExp(`\\bconst\\s+reactRootOptions\\s*=\\s*\\{[^;]*[{,]\\s*${name}\\s*[:,}]`), `\`${name}\` in \`reactRootOptions\``);
	appIndex.containsCode("ReactDOMClient.createRoot(appElement, reactRootOptions)", "...reactRootOptions");
	runtimeFile("client/components/segment-cache/cache").contains("currentTree.segment === nextTree.segment");
	runtimeFile("client/components/render-tree").contains("doesRouteStructureMatch(", "PrefetchHint.IsRootLayoutOrAbove", "isNavigatingToNewRootLayout(");
	runtimeFile("client/asset-prefix").contains("document.currentScript", "/_next/");
	const serverReferenceInfo = runtimeFile("shared/lib/server-reference-info");
	for (const name of [
		"SERVER_REFERENCE_ID_LENGTH",
		"mightBeServerReferenceId",
		"extractInfoFromServerReferenceId"
	]) serverReferenceInfo.export(name);
	runtimeFile("server/route-modules/route-module").contains("load-manifest.external", "loadManifestFromRelativePath", "evalManifestFromRelativePath");
	runtimeFile("build/templates/app-page-runtime").contains("server/route-modules/app-page/module.compiled");
	runtimeFile("server/app-render/get-css-inlined-link-tags").contains("filePath.replace(/\\.[^.]+$/, '')", "entryCSSFiles[filePathWithoutExt]");
	runtimeFile("server/app-render/render-css-resource").contains("entryCssFile.inlined", "entryCssFile.content", "/_next/${encodeURIPath(entryCssFile.path)}");
	runtimeFile("build/templates/app-page-runtime").contains("`Page changed from static to dynamic at runtime ${resolvedPathname}", "throw new NoFallbackError()");
	runtimeFile("build/templates/app-route").contains("if (isIsr) throw err;");
	runtimeFile("server/lib/router-utils/router-server-context").contains("Symbol.for('@next/router-server-methods')");
	runtimeFile("server/route-modules/route-module").contains("routerServerContext.logErrorWithOriginalStack(err");
	runtimeFile("server/route-modules/app-page/module").contains("this.matchers.get(prerenderManifest)");
	runtimeFile("build/utils").contains("config.dynamic = dynamic;", "config.runtime = runtime;");
	runtimeFile("build/index").containsCode("if (workerResult.prerenderedRoutes) {", "ssgPageRoutes = workerResult.prerenderedRoutes.filter((route)=>route.isPrerenderOutput !== false).map((route)=>route.pathname);", "} else if (!hasGenerateStaticParams && (appConfig.dynamic === 'error' || appConfig.dynamic === 'force-static')) {");
	runtimeFile("server/app-render/create-component-tree").contains("const err = new DynamicServerError(`Page with \\`dynamic = \"force-dynamic\"\\` won't be rendered statically.`);");
	runtimeFile("server/lib/implicit-tags").containsCode("const derivedTags = [`/layout`];");
	runtimeFile("server/app-render/stream-ops").contains("process.env.__NEXT_USE_NODE_STREAMS");
	const newExports = checkNodePlatform(context);
	const required = instrumentationRequire(runtimeFile(instrumentationModule).code);
	if (typeof required === "string") fail(`next/dist/esm/${instrumentationModule}.js has ${required}`);
	return {
		builtinBoundaries,
		newExports
	};
}
function checkNodePlatform({ projectRequire, fail }) {
	const nodePlatform = createNodePlatform("registry", "");
	const appPageModule = aliasPaths.routeModule("app-page").slice(10);
	const standIns = Object.entries({
		...nodePlatformModules,
		"ssr-app-page-module": [appPageModule]
	});
	const compiled = `next/dist/esm/${appPageModule}.compiled.js`;
	try {
		projectRequire.resolve(compiled);
	} catch (error) {
		fail(`${compiled} is not there, which the plugin stands in for`, error);
	}
	const newExports = {};
	for (const [name, modules] of standIns) {
		const { names } = declaredExports(nodePlatform.load(name));
		for (const nextModule of modules) {
			const id = nextModule.startsWith("compiled/") ? `next/dist/${nextModule}` : `next/dist/esm/${nextModule}.js`;
			let file;
			try {
				file = projectRequire.resolve(id);
			} catch (error) {
				return fail(`${id} is not there, which the plugin stands in for`, error);
			}
			for (const exported of exportNamesOf(file)) {
				if (names.has(exported)) continue;
				names.add(exported);
				(newExports[name] ??= []).push({
					name: exported,
					module: id
				});
			}
		}
	}
	return newExports;
}
//#endregion
//#region src/nextjs/project/transform.ts
const compiledByVite = /\.(?:m?ts|[jt]sx)$/;
/** Next's SWC transform of a module of the app, and the `paths` of its tsconfig. */
async function createCompiler(context) {
	const { root, fail, config, appDir, pageExtensions, distDir, next } = context;
	const { WEBPACK_LAYERS, getLoaderSWCOptions, getRSCModuleInformation, loadJsConfig, swc } = next;
	const { jsConfig, resolvedBaseUrl } = await loadJsConfig(root, config);
	const paths = resolvedBaseUrl && {
		baseUrl: resolvedBaseUrl.baseUrl,
		explicitBaseUrl: !resolvedBaseUrl.isImplicit,
		patterns: jsConfig?.compilerOptions?.paths ?? {}
	};
	const bundleLayers = {
		rsc: WEBPACK_LAYERS.reactServerComponents,
		ssr: WEBPACK_LAYERS.serverSideRendering,
		browser: WEBPACK_LAYERS.appPagesBrowser
	};
	const swcOptions = (file, layer) => {
		const { serverActions: _serverActions, cjsRequireOptimizer: _cjsRequireOptimizer, env: _env, ...options } = getLoaderSWCOptions({
			filename: file,
			development: false,
			isServer: layer !== "browser",
			pagesDir: void 0,
			appDir,
			isPageFile: false,
			isCacheComponents: config.cacheComponents,
			hasReactRefresh: false,
			configDir: root,
			modularizeImports: void 0,
			optimizePackageImports: void 0,
			swcPlugins: config.experimental.swcPlugins,
			compilerOptions: config.compiler,
			jsConfig,
			supportedBrowsers: void 0,
			swcCacheDir: path.join(distDir, "cache", "swc"),
			relativeFilePathFromRoot: path.relative(root, file),
			serverComponents: true,
			serverReferenceHashSalt: "",
			bundleLayer: bundleLayers[layer],
			esm: true,
			cacheHandlers: config.cacheHandlers,
			useCacheEnabled: config.experimental.useCache,
			taintEnabled: config.experimental.taint,
			pageExtensions
		});
		const { optimizer: _optimizer, regenerator: _regenerator, react, ...transform } = options.jsc.transform;
		return {
			...options,
			jsc: {
				...options.jsc,
				target: "esnext",
				externalHelpers: false,
				experimental: {
					...options.jsc.experimental,
					emitAssertForImportAttributes: false
				},
				transform: {
					...transform,
					react: compiledByVite.test(file) ? {
						...react,
						runtime: "preserve"
					} : react
				}
			},
			filename: file,
			sourceFileName: file,
			sourceMaps: true
		};
	};
	const compile = async (code, file, layer) => {
		const options = swcOptions(file, layer);
		let output;
		try {
			output = await swc.transform(code, options);
		} catch (error) {
			const exports = await exportStubs(code, file).catch(() => Promise.reject(error));
			const message = stripVTControlCharacters(error.message ?? String(error)).trim().replace(/(,-\[)(.+?)(:\d+:\d+\])/g, (frame, start, file, end) => path.isAbsolute(file) ? `${start}${normalizePath(path.relative(root, file))}${end}` : frame).replaceAll(root + path.sep, "");
			return {
				code: `throw new Error(${JSON.stringify(message)});\n${exports}`,
				refused: true
			};
		}
		if (layer === "rsc" && getRSCModuleInformation(output.code, true).type === "client") {
			if (compiledByVite.test(file)) return;
			return swc.transform(code, {
				...options,
				serverComponents: void 0
			});
		}
		return output;
	};
	if (!(await compile(`import { Inter } from "next/font/google";\nexport const inter = Inter({});\n`, path.join(appDir, "layout.js"), "rsc"))?.code.includes("next/font/google/target.css?")) fail("the SWC transform no longer turns a call of a `next/font` function into an import");
	if (await compile(`"use client";\nexport const a = 1;\n`, path.join(appDir, "a.ts"), "rsc")) fail("the SWC transform no longer marks a `\"use client\"` module of the rsc layer");
	const dependency = path.join(root, "node_modules", "dependency.js");
	return {
		compile,
		paths,
		dependencyCompileOptions: {
			rsc: swcOptions(dependency, "rsc"),
			ssr: swcOptions(dependency, "ssr"),
			browser: swcOptions(dependency, "browser")
		}
	};
}
//#endregion
//#region src/nextjs/project/webpack.ts
/**
* Calls the `webpack` function of a `next.config` with a config of webpack
* that has what the plugin reads of it, as Next calls it for the compiler of
* a layer, and reads the rules and the aliases it adds.
*/
function readWebpackFunction(webpack, options) {
	const read = {
		rules: [],
		aliases: {},
		differences: []
	};
	if (typeof webpack !== "function") return read;
	const babel = {
		loader: "next-swc-loader",
		options: {}
	};
	const before = {
		resolve: { alias: {} },
		module: { rules: [] },
		plugins: []
	};
	let after;
	try {
		after = webpack(before, {
			dir: options.root,
			dev: false,
			isServer: options.isServer,
			buildId: options.buildId,
			config: options.config,
			defaultLoaders: { babel },
			totalPages: 0,
			...options.isServer && { nextRuntime: "nodejs" }
		});
	} catch (error) {
		read.differences.push(`the \`webpack\` function of next.config failed, so none of it applies: ${error.message}`);
		return read;
	}
	for (const rule of after?.module?.rules ?? []) {
		const { test, use, ...rest } = rule ?? {};
		const uses = Array.isArray(use) ? use : [use];
		const loaders = uses.flatMap((entry) => {
			if (entry === babel) return [];
			if (typeof entry === "string") return [{
				loader: entry,
				options: void 0
			}];
			const { loader, options } = entry ?? {};
			return typeof loader === "string" ? [{
				loader,
				options
			}] : [];
		});
		if (!(test instanceof RegExp) || Object.keys(rest).length > 0 || loaders.length + (uses.includes(babel) ? 1 : 0) !== uses.length) {
			read.differences.push(`a rule of the \`webpack\` function of next.config does not apply: only one with a \`test\` and the loaders in \`use\` does, not ${String(test ?? "this one")}`);
			continue;
		}
		read.rules.push({
			test,
			loaders,
			compile: uses.includes(babel)
		});
	}
	for (const [name, target] of Object.entries(after?.resolve?.alias ?? {})) {
		const candidates = (Array.isArray(target) ? target : [target]).filter((candidate) => typeof candidate === "string");
		read.aliases[name] = candidates.map((candidate) => candidate.replace(/^private-next-root-dir(?=\/|$)/, options.root));
	}
	if ((after?.plugins?.length ?? 0) > 0) read.differences.push("the plugins of webpack that the `webpack` function of next.config adds do not run");
	return read;
}
/**
* The candidates of an alias for an import, as webpack takes them: a name
* matches the import and what is under it, and one that ends with `$` only
* the import itself.
*/
function aliasOf(aliases, source) {
	for (const [name, candidates] of Object.entries(aliases)) if (name.endsWith("$")) {
		if (source === name.slice(0, -1)) return candidates;
	} else if (source === name) return candidates;
	else if (source.startsWith(`${name}/`)) return candidates.map((candidate) => candidate + source.slice(name.length));
}
/**
* A file of a package by the import that names it, `@next/mdx/mdx-components.js`:
* what Vite pre-bundles. The candidate of an alias is often the file, as
* `require.resolve()` finds it.
*/
function importOfFile(file) {
	if (!path.isAbsolute(file) || !file.split(path.sep).includes("node_modules")) return file;
	for (let dir = path.dirname(file); path.basename(dir) !== "node_modules";) {
		const manifest = path.join(dir, "package.json");
		const name = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, "utf8")).name : void 0;
		if (name) return `${name}/${path.relative(dir, file).split(path.sep).join("/")}`;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return file;
}
/** The rules and aliases of the `webpack` function in `next.config`, for each layer. */
function createWebpackRules(context, runLoader) {
	const { root, projectRequire, config, buildId } = context;
	const read = (isServer) => readWebpackFunction(config.webpack, {
		root,
		isServer,
		buildId,
		config
	});
	const client = read(false);
	const server = read(true);
	const of = {
		rsc: server,
		ssr: server,
		browser: client
	};
	const ruleOf = (file, layer) => of[layer].rules.find((rule) => rule.test.test(file));
	const loaders = /* @__PURE__ */ new Map();
	const loaderAt = (request) => {
		let loader = loaders.get(request);
		if (!loader) {
			const loaded = projectRequire(request);
			loader = typeof loaded === "function" ? loaded : loaded.default;
			loaders.set(request, loader);
		}
		return loader;
	};
	const packagesOf = ({ aliases }) => Object.values(aliases).flat().map(importOfFile).filter((candidate) => {
		if (candidate.startsWith(".") || path.isAbsolute(candidate)) return false;
		try {
			projectRequire.resolve(candidate);
			return true;
		} catch {
			return false;
		}
	});
	return {
		webpackRuleOf: ruleOf,
		webpackPackages: {
			rsc: packagesOf(server),
			ssr: packagesOf(server),
			browser: packagesOf(client)
		},
		async loadWithWebpackRule(file, layer) {
			const rule = ruleOf(file, layer);
			if (!rule) return;
			let code = await fs.promises.readFile(file);
			for (const { loader, options } of rule.loaders.toReversed()) {
				const run = loaderAt(loader);
				const input = run.raw ? Buffer.from(code) : String(code);
				[code] = await runLoader(run, options, file, input);
			}
			return String(code);
		},
		webpackAliasOf: (source, layer) => aliasOf(of[layer].aliases, source)?.map(importOfFile),
		webpackDifferences: Array.from(/* @__PURE__ */ new Set([...client.differences, ...server.differences]))
	};
}
//#endregion
//#region src/nextjs/project.ts
const adapterPath = fileURLToPath(new URL(`./adapter${path.extname(import.meta.url)}`, import.meta.url));
const envWorker = fileURLToPath(new URL(`./project/env-worker${path.extname(import.meta.url)}`, import.meta.url));
async function loadNextProject(root, projectRequire = createRequire(path.join(root, "package.json")), { build = "development", static: isStatic = false } = {}) {
	const context = await openNextProject(root, projectRequire, {
		static: isStatic,
		envWorker
	});
	const app = await discoverAppRoutes(context);
	const middleware = await findMiddleware(context);
	const { routing, routesManifest, unmatchedRoutes } = await buildRouting(context, app, middleware, adapterPath);
	const { builtinBoundaries, newExports } = checkRuntime(context);
	const layers = await layerTables(context, build);
	const compiler = await createCompiler(context);
	const { runLoader, ...loaders } = createLoaders(context, build);
	return {
		root,
		appDir: context.appDir,
		nextDir: context.nextDir,
		version: context.version,
		routes: app.routes,
		edgeRouteFiles: app.edgeRouteFiles,
		unmatchedRoutes,
		newExports,
		middlewareFile: middleware.middlewareFile,
		routing,
		routesManifest,
		preview: context.previewProps,
		env: context.env,
		loadEnv: context.loadEnv,
		config: JSON.parse(JSON.stringify({
			...context.config,
			env: Object.fromEntries(Object.keys(context.config.env).map((name) => [name, context.env.values[name]]))
		})),
		...layers,
		...routeEntries(context, app, middleware, builtinBoundaries, runLoader),
		...compiler,
		...loaders,
		...createWebpackRules(context, runLoader),
		...createMetadataLoaders(context, runLoader)
	};
}
//#endregion
//#region src/async-local-storage-transform.ts
const call = "__vitest_plugin_rsc_call__";
const isFunction = (node) => node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
function isNode(value) {
	return typeof value === "object" && value !== null && typeof value.type === "string";
}
function children(node) {
	const result = [];
	for (const key in node) {
		const value = node[key];
		if (Array.isArray(value)) {
			for (const item of value) if (isNode(item)) result.push(item);
		} else if (isNode(value)) result.push(value);
	}
	return result;
}
function addNames(pattern, names) {
	if (!pattern) return;
	if (pattern.type === "Identifier") names.add(pattern.name);
	else if (pattern.type === "ObjectPattern") for (const property of pattern.properties) addNames(property.value ?? property.argument, names);
	else if (pattern.type === "ArrayPattern") for (const element of pattern.elements) addNames(element, names);
	else addNames(pattern.left ?? pattern.argument, names);
}
function afterArrow(code, from, to) {
	for (let i = from; i < to; i++) {
		if (code.startsWith("//", i)) i = code.indexOf("\n", i);
		else if (code.startsWith("/*", i)) i = code.indexOf("*/", i) + 1;
		else if (code.startsWith("=>", i)) return i + 2;
		if (i < 0) break;
	}
	throw new Error("vitest-plugin-rsc: an arrow function without `=>`");
}
/**
* Compiles the async functions of a module to call `hooks`, an expression for
* `asyncFunctionHooks` of async-local-storage.ts. Returns nothing for code
* that stays as it is, and throws for code that does not parse.
*/
function transformAsyncFunctions(code, id, hooks) {
	if (!/\bawait\b/.test(code)) return;
	const program = parseAst(code);
	const insertions = [];
	let order = 0;
	function visit(node, fn) {
		const at = order++;
		const open = (position, text) => fn.insertions.push({
			at: position,
			text,
			closes: false,
			order: at
		});
		const close = (position, text) => fn.insertions.push({
			at: position,
			text,
			closes: true,
			order: at
		});
		if (isFunction(node)) {
			for (const param of node.params) visit(param, void 0);
			const own = node.async && !node.generator ? {
				awaits: false,
				compiles: true,
				vars: /* @__PURE__ */ new Set(),
				insertions: []
			} : void 0;
			visit(node.body, own);
			if (!own?.awaits || !own.compiles) return;
			if (node.body.type === "BlockStatement") {
				const declared = node.body.body.filter((statement) => statement.type === "FunctionDeclaration").map((statement) => statement.id.name);
				if (new Set(declared).size < declared.length) return;
				if (declared.some((name) => own.vars.has(name))) return;
			}
			const enter = `const ${call}=${hooks}.e();try{`;
			const exit = `}finally{${hooks}.x(${call})}`;
			if (node.body.type === "BlockStatement") {
				let start = node.body.start + 1;
				let separator = "";
				for (const statement of node.body.body) {
					if (typeof statement.directive !== "string") break;
					start = statement.end;
					separator = ";";
				}
				insertions.push({
					at: start,
					text: separator + enter,
					closes: false,
					order: at
				});
				insertions.push({
					at: node.body.end - 1,
					text: exit,
					closes: true,
					order: at
				});
			} else {
				const lastParam = node.params.at(-1);
				const body = afterArrow(code, lastParam ? lastParam.end : node.start, node.body.start);
				insertions.push({
					at: body,
					text: `{${enter}return(`,
					closes: false,
					order: at
				});
				insertions.push({
					at: node.end,
					text: `)${exit}}`,
					closes: true,
					order: at
				});
			}
			insertions.push(...own.insertions);
			return;
		}
		if (fn) switch (node.type) {
			case "AwaitExpression": {
				const argument = node.argument;
				fn.awaits = true;
				open(node.start, `${hooks}.r(${call},`);
				open(argument.start, `${hooks}.s(${call},(`);
				close(argument.end, "))");
				close(node.end, ")");
				break;
			}
			case "TryStatement": {
				const handler = node.handler;
				const finalizer = node.finalizer;
				if (handler) open(handler.body.start + 1, `${hooks}.c(${call});`);
				if (finalizer) open(finalizer.start + 1, `${hooks}.c(${call});`);
				break;
			}
			case "ForOfStatement":
				if (node.await) fn.compiles = false;
				break;
			case "VariableDeclaration":
				if (node.kind === "await using") fn.compiles = false;
				if (node.kind === "var") for (const { id } of node.declarations) addNames(id, fn.vars);
		}
		for (const child of children(node)) visit(child, fn);
	}
	visit(program, void 0);
	if (insertions.length === 0) return;
	const output = new MagicString(code);
	insertions.sort((a, b) => a.at - b.at || Number(b.closes) - Number(a.closes) || (a.closes ? b.order - a.order : a.order - b.order));
	for (const { at, text, closes } of insertions) if (closes) output.appendLeft(at, text);
	else output.appendRight(at, text);
	return {
		code: output.toString(),
		map: output.generateMap({
			source: id,
			includeContent: true,
			hires: "boundary"
		})
	};
}
//#endregion
//#region src/nextjs/server-code.ts
/** Globals of a browser that a server does not have. */
const browserGlobals = [
	"window",
	"document",
	"location",
	"localStorage",
	"sessionStorage"
];
/** Globals a server has too, but its own. */
const serverGlobals = [
	"Request",
	"Response",
	"fetch",
	"setImmediate",
	"clearImmediate",
	"setTimeout",
	"clearTimeout"
];
const mentionsServerGlobal = new RegExp(`\\b(?:${serverGlobals.join("|")})\\b`);
const mentionsTypeof = /\btypeof\b/;
const mentionsBrowserGlobal = new RegExp(`\\b(?:${browserGlobals.join("|")})\\b`);
/** Compiles JavaScript as server code. Returns nothing for code that stays as it is. */
async function compileServerCode(code, id, registry, define = {}) {
	const defines = { ...define };
	if (mentionsServerGlobal.test(code)) for (const name of serverGlobals) defines[name] = defines[`globalThis.${name}`] = `${registry}.${name}`;
	if (mentionsTypeof.test(code) && mentionsBrowserGlobal.test(code)) for (const name of browserGlobals) defines[`typeof ${name}`] = "\"undefined\"";
	if (Object.keys(defines).length === 0) return;
	return transformWithOxc(code, id, {
		lang: "js",
		define: defines
	});
}
const ownDir$1 = normalizePath(fileURLToPath(new URL("..", import.meta.url)));
function* nodeModulesOf(from) {
	for (let dir = from;; dir = path.dirname(dir)) {
		yield path.join(dir, "node_modules");
		if (dir === path.dirname(dir)) return;
	}
}
function findPackage(name, from) {
	for (const nodeModules of nodeModulesOf(from)) {
		const candidate = path.join(nodeModules, name);
		if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
	}
}
function dependenciesOf(dir) {
	const file = path.join(dir, "package.json");
	if (!fs.existsSync(file)) return [];
	const { dependencies = {} } = JSON.parse(fs.readFileSync(file, "utf8"));
	return Object.keys(dependencies);
}
function ownPackageDir() {
	let dir = path.dirname(fileURLToPath(import.meta.url));
	while (!fs.existsSync(path.join(dir, "package.json")) && dir !== path.dirname(dir)) dir = path.dirname(dir);
	return fs.realpathSync(dir);
}
function ownPackageDirs() {
	const dir = ownPackageDir();
	const dependencies = dependenciesOf(dir).map((name) => findPackage(name, dir));
	return /* @__PURE__ */ new Set([dir, ...dependencies.filter((found) => found !== void 0)]);
}
function findPackagesWithDependencies(names, root) {
	const dirs = /* @__PURE__ */ new Set();
	const named = new Set(names);
	const appDirs = new Set(dependenciesOf(root).map((name) => findPackage(name, root)).filter((dir) => dir !== void 0));
	const own = ownPackageDirs();
	const visit = (name, from) => {
		const dir = findPackage(name, from);
		if (!dir || own.has(dir) || dirs.has(normalizePath(dir))) return;
		if (!named.has(name) && appDirs.has(dir)) return;
		dirs.add(normalizePath(dir));
		for (const dependency of dependenciesOf(dir)) visit(dependency, dir);
	};
	for (const name of named) visit(name, root);
	return dirs;
}
const hostPackages = (packages) => [
	"vitest",
	"@vitest/*",
	...packages
];
const packageNameOf = (specifier) => /^(?:@[^/]+\/)?[^/]+/.exec(specifier)[0];
function* hostPackageNames(root, packages) {
	for (const name of ["vite", ...hostPackages(packages)]) {
		if (!/^@[^/]+\/\*$/.test(name)) {
			yield packageNameOf(name);
			continue;
		}
		const scope = name.slice(0, -2);
		for (const nodeModules of nodeModulesOf(root)) {
			const dir = path.join(nodeModules, scope);
			if (fs.existsSync(dir)) for (const child of fs.readdirSync(dir)) yield `${scope}/${child}`;
		}
	}
}
function packageDirOf(file) {
	return /^.*\/node_modules\/(?:@[^/]+\/)?[^/]+(?=\/)/.exec(file)?.[0];
}
const name = "vitest-plugin-rsc:next-server-code";
const asyncFunctionsName = "vitest-plugin-rsc:next-async-functions";
function nextModulesWithStoresOf(layer) {
	const modules = nextModulesWithStores.filter((entry) => entry.layer === layer);
	if (modules.length === 0) return;
	return withStoresFiles(modules.map(({ module }) => module));
}
const performWork = "function performWork(request) {";
const issues = "https://github.com/storybookjs/vitest-plugin-rsc/issues";
function nextVersionOf(id) {
	const root = normalizePath(id).match(/^(.*\/next)\/dist\//)?.[1];
	try {
		return JSON.parse(fs.readFileSync(`${root}/package.json`, "utf8")).version;
	} catch {
		return "?";
	}
}
function createServerCode(registry, options = {}) {
	const patterns = [options.browserModules ?? []].flat();
	const hostFiles = [options.host?.files ?? []].flat();
	const packages = options.host?.packages ?? [];
	let isBrowserModule = () => false;
	const testFileMatchers = [];
	let isOwnFileOfHost = () => false;
	const hostPackageNamesOfOptions = hostPackages(packages);
	let hostPackageDirs = /* @__PURE__ */ new Set();
	/**
	* Whether a file is one of the host's: a test file or a setup file of
	* Vitest, or a file of another host, like a story.
	*/
	function isHostFile(file) {
		return isOwnFileOfHost(normalizePath(file)) || isTestFile(file);
	}
	/** Whether a file is a test file or a setup file of Vitest. */
	function isTestFile(file) {
		file = normalizePath(file);
		return testFileMatchers.some((matches) => matches(file));
	}
	const knowsHostFiles = () => hostFiles.length > 0 || testFileMatchers.length > 0;
	/**
	* Whether a file is server code in a layer. The rsc layer shares its
	* environment with the test: the test files, what runs them and the
	* `browserModules` of the options are not.
	*/
	function isServerCode(file, layer) {
		if (layer === "browser" || !path.isAbsolute(file)) return false;
		file = normalizePath(file);
		if (file.startsWith(ownDir$1)) return false;
		if (layer === "ssr") return true;
		if (isBrowserModule(file) || isHostFile(file)) return false;
		const packageDir = packageDirOf(file);
		return !packageDir || !hostPackageDirs.has(packageDir);
	}
	function compileAsyncFunctions(context, code, file) {
		try {
			return transformAsyncFunctions(code, file, `${registry}.asyncFunctionHooks`);
		} catch (error) {
			const reason = String(error instanceof Error ? error.message : error);
			context.warn(`vitest-plugin-rsc: the async functions of ${file} do not keep their stores across an await, it does not parse as JavaScript. ${reason.replace(/\s+/g, " ")}`);
		}
	}
	/** The file of a module, if it is a source file that is server code in a layer. */
	function sourceFileOf(id, cacheDir, layer) {
		const file = id.split("?")[0];
		if (!/\.[cm]?[jt]sx?$/.test(file) || !fs.existsSync(file)) return;
		if (file.includes("/node_modules/") || file.startsWith(`${cacheDir}/`)) return;
		if (isServerCode(file, layer)) return file;
	}
	function flightServerOf(code, id) {
		if (!vendoredFlightServer.test(normalizePath(id))) return;
		if (!code.includes(performWork)) throw new Error(`vitest-plugin-rsc: ${id}, React's Flight server of next@${nextVersionOf(id)}, has no \`${performWork}\` to compile, which every render of a server needs to keep its stores. This Next.js is newer than the plugin knows: report it at ${issues}.`);
		return {
			code: code.replace(performWork, `function performWork(request) { ${registry}.performWork(request, performWorkOfReact); }\nfunction performWorkOfReact(request) {`),
			define: { queueMicrotask: `${registry}.queueMicrotask` }
		};
	}
	return {
		isServerCode,
		isHostFile,
		isTestFile,
		/**
		* Whether an import is of a package of the host, by its name: `vitest`,
		* `vitest/browser`, `@vitest/spy`. Not what such a package depends on.
		*/
		isHostPackage(specifier) {
			return hostPackageNamesOfOptions.some((name) => name.endsWith("/*") ? specifier.startsWith(name.slice(0, -1)) : specifier === name || specifier.startsWith(`${name}/`));
		},
		/**
		* Whether a source file is code of the app in a layer: what Next's build
		* compiles. Not in the rsc layer: what is the browser's there, the test
		* files and the `browserModules`. And in no layer a file of the host,
		* which with `"use client"` is a module of the browser layer: it is the
		* host's to compile, as any test file of Vitest, with Vite's own
		* transforms and the host's config, not with Next's.
		*/
		isAppCode(file, layer) {
			if (!path.isAbsolute(file) || normalizePath(file).includes("/node_modules/")) return false;
			if (layer !== "rsc") return !normalizePath(file).startsWith(ownDir$1) && !isHostFile(file);
			return knowsHostFiles() && isServerCode(file, layer);
		},
		/** For the `define` of the optimizer of a server layer, which Vite keys its cache on. */
		cacheKey: {
			__vitest_plugin_rsc_browser_modules__: JSON.stringify([
				patterns.map(String),
				hostFiles.map(String),
				packages
			]),
			__vitest_plugin_rsc_modules_with_stores__: JSON.stringify(nextModulesWithStores)
		},
		/**
		* The same for the browser layer, which pre-bundles the packages of the
		* host as the page's own: Vite does not key its cache on the plugins of
		* the optimizer.
		*/
		browserCacheKey: { __vitest_plugin_rsc_host_packages__: JSON.stringify(packages) },
		/** For a module this plugin generates, with the constants of its layer. */
		compile: async (code, id, define) => (await compileServerCode(code, id, registry, define))?.code ?? code,
		/** Call once the root of the project is known. */
		configure(root) {
			if (patterns.length > 0) isBrowserModule = createFilter(patterns, null, { resolve: root });
			if (hostFiles.length > 0) isOwnFileOfHost = createFilter(hostFiles, null, { resolve: root });
			hostPackageDirs = findPackagesWithDependencies(hostPackageNames(root, packages), root);
		},
		/** Call with what a Vitest config says is a test file or a setup file. */
		addTestFiles(matches) {
			testFileMatchers.push(matches);
		},
		/**
		* What a dependency of a server layer needs on top of `compileServerCode()`
		* to keep its stores across an `await` and a render, for a static build,
		* which has no optimizer: see `optimizerPlugin()` and
		* `asyncFunctionsOptimizerPlugin()`.
		*/
		forStores(context, code, id, layer) {
			if (nextModulesWithStoresOf(layer)?.test(normalizePath(id))) return {
				code: compileAsyncFunctions(context, code, id)?.code ?? code,
				define: {}
			};
			return (layer === "rsc" ? flightServerOf(code, id) : void 0) ?? {
				code,
				define: {}
			};
		},
		/** For the dependency optimizer: the pre-bundled dependencies of a layer. */
		optimizerPlugin(layer) {
			return {
				name,
				async transform(code, id) {
					if (!/\.[cm]?js$/.test(id) || !isServerCode(id, layer)) return;
					const flight = layer === "rsc" ? flightServerOf(code, id) : void 0;
					if (flight) code = flight.code;
					const define = flight?.define;
					try {
						return await compileServerCode(code, id, registry, define);
					} catch (error) {
						const reason = String(error instanceof Error ? error.message : error);
						this.warn(`vitest-plugin-rsc: ${id} is not compiled as server code, it does not parse as JavaScript. ${reason.replace(/\s+/g, " ")}`);
					}
				}
			};
		},
		/**
		* The async functions that have to read, after an `await`, a store Next
		* entered for them, or left for them with `exit()`: see
		* async-local-storage-transform.ts. For the dependency optimizer of a
		* server layer, the modules of Next's server in `nextModulesWithStores`
		* that are that layer's. The bundler hands it each file of a dependency
		* it pre-bundles, by its path, so a module inside the bundle of
		* `app-page/module` is one.
		*/
		asyncFunctionsOptimizerPlugin(layer) {
			const modules = nextModulesWithStoresOf(layer);
			return {
				name: asyncFunctionsName,
				transform(code, id) {
					if (modules?.test(normalizePath(id))) return compileAsyncFunctions(this, code, id);
				}
			};
		},
		/** And the source files of the app in the `rsc` layer, by the name of its environment. */
		asyncFunctionsPlugin(environment) {
			return {
				name: asyncFunctionsName,
				applyToEnvironment: ({ name }) => name === environment,
				transform(code, id) {
					const file = sourceFileOf(id, normalizePath(this.environment.config.cacheDir), "rsc");
					if (file && knowsHostFiles()) return compileAsyncFunctions(this, code, file);
				}
			};
		},
		/** For the source files of the server layers, by the name of their environment. */
		plugin(environments) {
			return {
				name,
				applyToEnvironment: (environment) => Object.hasOwn(environments, environment.name),
				async transform(code, id) {
					const layer = environments[this.environment.name];
					const file = sourceFileOf(id, normalizePath(this.environment.config.cacheDir), layer);
					if (!file) return;
					if (layer === "rsc" && !knowsHostFiles()) throw new Error(`vitest-plugin-rsc: ${file} is a file of the app, or one of the host's, and nothing says which. Under Vitest the test files and the setup files come from its config, through \`configureVitest\`, which Vitest calls for the plugins of a project, not for one of \`injectTestProjects\`. Another host lists its files in the \`host.files\` option of vitestPluginNext().`);
					return compileServerCode(code, file, registry);
				}
			};
		}
	};
}
//#endregion
//#region src/nextjs/optimizer-cache-key.ts
const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
/**
* What the project gives the optimizer's plugins of a layer: Next's alias
* table and the app's, which the resolver picks from by the importer, and the
* options of Next's transform for a dependency. The tables in their order,
* not sorted: the resolver takes the first entry that matches, and a prefix
* like `next` can match where a later one would. The order is the code's,
* the same for every run. And the stubs of the stand-ins, of the version of
* Next.
*/
function projectKey(project, layer) {
	return hash(JSON.stringify([
		Object.entries(project.aliases[layer]),
		Object.entries(project.appAliases[layer]),
		project.dependencyCompileOptions[layer],
		project.newExports,
		project.version
	]));
}
const isCode = (file) => /\.[cm]?[jt]sx?$/.test(file) && !/\.test\.[cm]?[jt]sx?$/.test(file) && !/\.d\.[cm]?ts$/.test(file);
/**
* The code of a directory of the plugin: the contents of every file of it.
* The contents, not the version, which a build of this repository keeps, and
* not the times of the files, which every build changes. All of the code,
* not just the modules that compile a dependency: a bundle of `dist` mixes
* modules, and what those import is just as much the compile.
*/
function codeKey(dir) {
	const content = createHash("sha256");
	const files = fs.readdirSync(dir, {
		recursive: true,
		encoding: "utf8"
	}).map((file) => file.split(path.sep).join("/")).filter(isCode).sort();
	for (const file of files) {
		const full = path.join(dir, file);
		if (!fs.statSync(full).isFile()) continue;
		content.update(`${file}\0`).update(fs.readFileSync(full)).update("\0");
	}
	return content.digest("hex").slice(0, 16);
}
function ownCodeDirs() {
	const file = fileURLToPath(import.meta.url);
	for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
		const manifest = path.join(dir, "package.json");
		if (!fs.existsSync(manifest)) continue;
		const { name } = JSON.parse(fs.readFileSync(manifest, "utf8"));
		if (name !== "vitest-plugin-rsc") return [];
		return ["src", "dist"].map((code) => path.join(dir, code)).filter((code) => fs.statSync(code, { throwIfNoEntry: false })?.isDirectory());
	}
	return [];
}
let ownCodeKey;
/** For the `define` of the optimizer of a layer, which Vite keys its cache on. */
function optimizerCacheKey(project, layer) {
	if (ownCodeKey === void 0) try {
		ownCodeKey = hash(ownCodeDirs().map((dir) => `${path.basename(dir)}:${codeKey(dir)}`).join(","));
	} catch {
		ownCodeKey = "";
	}
	return {
		__vitest_plugin_rsc_project__: JSON.stringify(projectKey(project, layer)),
		__vitest_plugin_rsc_code__: JSON.stringify(ownCodeKey)
	};
}
//#endregion
//#region src/nextjs/use-cache.ts
/** The module with the function that compiled code wraps a cached function in. */
const useCacheId = "virtual:vitest-plugin-rsc/next-use-cache";
const useCacheModule = (registry) => `
import { cache } from ${JSON.stringify(cacheWrapper)};
import { cache as reactCache } from "react";
// One for every function: a function with the directive that closes over a
// value is wrapped where it is created, for every call of the function around
// it, and the calls of each are still one per render. Next's compiler wraps
// it once, at the top of the module.
const wrapped = new WeakMap();
export function useCache(kind, id, fn, undeclared) {
  let cached = wrapped.get(fn);
  if (cached) return cached;
  cached = reactCache(function () {
    // The arguments the function declares, as Next's compiler passes them:
    // what a caller passes on top of those, like the index of a \`map()\`, is
    // no part of the key. \`fn.length\` also counts what the function closes
    // over, which comes first: it is passed like an argument of the call,
    // not as a bound argument, and is part of the key like one.
    const end = undeclared === null ? undefined : fn.length + undeclared;
    const args = Array.prototype.slice.call(arguments, 0, end);
    // The id is a part of the key. It changes when the caches are reset, so
    // that no test finds what an earlier one cached: see cache.ts. In hex, as
    // Next's id, which a cache handler sees in the key.
    const generation = ${registry}.cacheGeneration().toString(16).padStart(8, "0");
    return cache(kind, id + generation, 0, fn, args);
  });
  Object.defineProperty(cached, "name", { value: fn.name });
  wrapped.set(fn, cached);
  return cached;
}
`;
/**
* Whether the app has `"use cache"`: what Next's compiler takes the directive
* with. Only then is the directive compiled.
*/
function usesCache(project) {
	const config = project.config;
	return Boolean(config.cacheComponents || config.experimental?.useCache);
}
const directive = /^use cache(?:: (.+))?$/;
function undeclaredParams(node) {
	if (!node?.params || !/Function/.test(node.type)) return null;
	if (node.params.some((param) => param.type === "RestElement")) return null;
	const counted = node.params.findIndex((param) => param.type === "AssignmentPattern");
	return counted === -1 ? 0 : node.params.length - counted;
}
function createUseCachePlugin(getProject, layerOf, isAppCode) {
	return {
		name: "vitest-plugin-rsc:next-use-cache",
		async transform(code, id) {
			if (!code.includes("use cache")) return;
			if (!usesCache(getProject())) return;
			const file = id.split("?")[0];
			if (layerOf(this.environment.name) !== "rsc" || !isAppCode(file, "rsc")) return;
			if (!fs.existsSync(file)) return;
			const ast = await parseAstAsync(code);
			const idOf = (name) => createHash("sha1").update(`${file}#${name}`).digest("hex");
			const runtime = (kind, value, name, node) => `$$useCache(${JSON.stringify(kind ?? "default")}, ${JSON.stringify(idOf(name))}, ${value}, ${undeclaredParams(node)})`;
			let moduleKind;
			let ofModule = false;
			for (const statement of ast.body) {
				if (statement.type !== "ExpressionStatement" || !("directive" in statement)) break;
				const match = directive.exec(String(statement.directive));
				if (match) [ofModule, moduleKind] = [true, match[1]];
			}
			const { output } = ofModule ? transformWrapExport(code, ast, {
				runtime: (value, name, meta) => runtime(moduleKind, value, name, meta.valueNode),
				ignoreExportAllDeclaration: true,
				rejectNonAsyncFunction: true
			}) : transformHoistInlineDirective(code, ast, {
				directive,
				runtime: (value, name, meta) => runtime(meta.directiveMatch[1], value, name, meta.valueNode),
				rejectNonAsyncFunction: true,
				noExport: true
			});
			if (!output.hasChanged()) return;
			output.prepend(`import { useCache as $$useCache } from ${JSON.stringify(useCacheId)};\n`);
			return {
				code: output.toString(),
				map: output.generateMap({ hires: "boundary" })
			};
		}
	};
}
//#endregion
//#region src/nextjs/paths.ts
/**
* The part of `request` that the `*` of `pattern` stands for, or nothing. A
* pattern has one `*` at most: Next leaves out one with more.
*/
function matchOf(pattern, request) {
	const star = pattern.indexOf("*");
	if (star === -1) return pattern === request ? "" : void 0;
	if (pattern.includes("*", star + 1)) return void 0;
	const [before, after] = [pattern.slice(0, star), pattern.slice(star + 1)];
	return request.length >= before.length + after.length && request.startsWith(before) && request.endsWith(after) ? request.slice(before.length, request.length - after.length) : void 0;
}
/**
* The files that the `paths` have for a request, in order: TypeScript takes
* the pattern with the longest prefix. Not a declaration file, which is for
* the types only.
*/
function candidatesOf(paths, request) {
	const prefix = (pattern) => pattern.split("*")[0].length;
	const pattern = Object.keys(paths.patterns).filter((candidate) => matchOf(candidate, request) !== void 0).sort((a, b) => prefix(b) - prefix(a))[0];
	if (!pattern) return [];
	return paths.patterns[pattern].filter((target) => !target.endsWith(".d.ts")).map((target) => path.resolve(paths.baseUrl, target.replace("*", matchOf(pattern, request))));
}
function createPathsPlugin(getProject) {
	return {
		name: "vitest-plugin-rsc:next-paths",
		enforce: "pre",
		async resolveId(source, importer, options) {
			const { paths } = getProject();
			if (!paths || !importer || importer.includes("/node_modules/")) return;
			if (!(!source.startsWith(".") && !source.startsWith("\0")) || path.isAbsolute(source)) return;
			const resolve = (id) => this.resolve(id, importer, {
				...options,
				skipSelf: true
			});
			for (const candidate of candidatesOf(paths, source)) {
				const resolved = await resolve(candidate);
				if (resolved) return resolved;
			}
			if (!paths.explicitBaseUrl) return;
			return await resolve(source) ?? resolve(path.resolve(paths.baseUrl, source));
		}
	};
}
//#endregion
//#region src/nextjs/page-timers.ts
const define = Object.fromEntries(timerNames.map((name) => [name, `${ssrImportMetaKey}.${timersKey}.${name}`]));
const mentionsTimer = new RegExp(`\\b(?:${timerNames.join("|")})\\b`);
/**
* For the modules of the browser layer, by the name of its environment, but
* those of a file that `isHostFile()`.
*/
function pageTimersPlugin(environment, isHostFile) {
	return {
		name: "vitest-plugin-rsc:next-page-timers",
		enforce: "post",
		applyToEnvironment: ({ name }) => name === environment,
		transform: {
			filter: { code: mentionsTimer },
			async handler(code, id) {
				const file = fileOfModule(id);
				if (file !== void 0 && isHostFile(file)) return;
				try {
					return await transformWithOxc(code, normalizePath(id), {
						lang: "js",
						define
					});
				} catch (error) {
					const reason = String(error instanceof Error ? error.message : error);
					this.warn(`vitest-plugin-rsc: the timers of ${id} keep running after its page is left, it does not parse as JavaScript. ${reason.replace(/\s+/g, " ")}`);
				}
			}
		}
	};
}
//#endregion
//#region src/nextjs/static-build.ts
const configPaths = [
	["configFile"],
	["outputFileTracingRoot"],
	["repoRoot"],
	["turbopack", "root"],
	["images", "loaderFile"],
	["cacheHandler"],
	["cacheHandlers", "*"],
	["adapterPath"]
];
/**
* The `next.config` of the app as the layers of a static build have it: with
* each option that is a path of the machine as a path from the root of the
* project, like `next.config.ts` and `../..`. Next's build reads them, and its
* server reads none for a request but the cache handlers, which the plugin
* imports by a module of its own, which the build bundles. A build would
* otherwise have the directory it was built in, and differ from machine to
* machine.
*
* By the options, not by what a value looks like: `basePath: "/app"` of a
* project in `/app` is no path of the machine.
*/
function withPathsFromRoot(config, root) {
	const copy = JSON.parse(JSON.stringify(config));
	const relativize = (object, [key, ...rest]) => {
		for (const name of key === "*" ? Object.keys(object) : [key]) {
			const value = object[name];
			if (rest.length > 0) {
				if (value && typeof value === "object") relativize(value, rest);
			} else if (typeof value === "string" && path.isAbsolute(value)) object[name] = normalizePath(path.relative(root, value)) || ".";
		}
	};
	for (const keys of configPaths) relativize(copy, keys);
	return copy;
}
function nextStaticBuild(options) {
	const { rsc, ssr, browser } = options.environments;
	let manager;
	let reached;
	return {
		name: "vitest-plugin-rsc:next-static-build",
		config(_config, { command }) {
			if (command !== "build") return;
			return withStaticBuild({
				entries: {
					[ssr]: options.entries.ssr,
					[browser]: options.entries.browser
				},
				directives: ["use turbopack: no side effects"],
				strictExecutionOrder: true,
				files: options.emittedFiles,
				clientReferences: { [ssr]: () => reached }
			});
		},
		configResolved(resolved) {
			if (resolved.command !== "build") return;
			manager = getPluginApi(resolved)?.manager;
			if (!resolved.plugins.some((plugin) => plugin.name === "vitest-plugin-rsc:static-build")) throw new Error("vitest-plugin-rsc: vitestPluginNext() needs vitestPluginRSC().");
		},
		buildEnd(error) {
			if (error || this.environment.mode !== "build" || this.environment.name !== rsc) return;
			if (!manager || manager.isScanBuild) return;
			reached = void 0;
			if (!this.getModuleInfo(options.rscModule)) return;
			const references = manager.clientReferenceMetaMap;
			const found = /* @__PURE__ */ new Set();
			const queue = [...this.getModuleIds()].filter((id) => id === options.rscModule || options.isHostFile(id) && !references[id]);
			const seen = new Set(queue);
			for (const id of queue) {
				const reference = references[id];
				if (reference) {
					found.add(reference.referenceKey);
					continue;
				}
				const info = this.getModuleInfo(id);
				for (const imported of [...info?.importedIds ?? [], ...info?.dynamicallyImportedIds ?? []]) {
					if (seen.has(imported)) continue;
					seen.add(imported);
					queue.push(imported);
				}
			}
			reached = found;
		}
	};
}
//#endregion
//#region src/nextjs/vitest-version.ts
const minimumVitest = "5.0.4";
const partsOf = (version) => version.split(/[.+-]/, 3).map((part) => Number(part) || 0);
/** Throws for a Vitest that the plugin does not run in. */
function assertVitestVersion(version) {
	const [major = 0, minor = 0, patch = 0] = partsOf(version);
	const [needMajor = 0, needMinor = 0, needPatch = 0] = partsOf(minimumVitest);
	if (major !== needMajor ? major > needMajor : minor !== needMinor ? minor > needMinor : patch >= needPatch) return;
	throw new Error(`vitest-plugin-rsc: runs in Vitest ${minimumVitest} or later, and this is Vitest ${version}. Update vitest and the @vitest packages of the project.`);
}
//#endregion
//#region src/nextjs/plugin.ts
const environmentOf = {
	rsc: "client",
	ssr: "next_ssr",
	browser: "react_client"
};
const layers = Object.keys(environmentOf);
const registry = `globalThis.${registryGlobal}`;
const fileEntry = (file) => escapePath(normalizePath(file));
const appEntriesOf = (project) => `${fileEntry(project.appDir)}/**/*.{js,jsx,ts,tsx}`;
const manifestId = "virtual:vitest-plugin-rsc/next-manifest";
const virtual = (name) => `virtual:vitest-plugin-rsc/next-${name}`;
const routeEntryPrefix = virtual("route/");
const routeLists = {
	page: virtual("app-pages"),
	route: virtual("route-handlers")
};
const routeKinds = Object.keys(routeLists);
const middlewareId = virtual("middleware");
const middlewareEntryId = virtual("middleware-entry");
const metadataPrefix = virtual("metadata/");
const envId = virtual("env");
const cacheHandlersId = virtual("cache-handlers");
const rootParamsId = virtual("root-params");
const prerenderId = virtual("prerender");
const nextRouting = "@next/routing";
const entryOf = (route) => route.component ?? route.page;
const isRouteModule = (id) => id.startsWith(routeEntryPrefix) || routeKinds.some((kind) => id === routeLists[kind]);
function importedByRoute(module) {
	const seen = /* @__PURE__ */ new Set([module]);
	for (const node of seen) {
		if (changesInPlace(node)) continue;
		for (const importer of node.importers) {
			const id = importer.id?.startsWith("\0") ? importer.id.slice(1) : void 0;
			if (id !== void 0 && (isRouteModule(id) || id === middlewareId || id === middlewareEntryId)) return true;
			seen.add(importer);
		}
	}
	return false;
}
const hmrBoundary = (entries) => `import.meta.hot?.accept([${entries.join(", ")}]);\n`;
const bridgePrefix = "\0vitest-plugin-rsc/next-bridge/";
const emptyModuleId = "\0vitest-plugin-rsc/next-empty";
const emptyModule = "const empty = {};\nexport default empty;\n";
const vendoredFlight = (entry) => `@vitejs/plugin-rsc/vendor/react-server-dom/${entry}`;
const ownDir = normalizePath(fileURLToPath(new URL("..", import.meta.url)));
const ownFile = (name) => normalizePath(fileURLToPath(new URL(`./${name}${path.extname(import.meta.url)}`, import.meta.url)));
const setupFile = ownFile("setup");
const testingLibrary = {
	specifier: "vitest-plugin-rsc/nextjs/testing-library",
	file: ownFile("index")
};
const testerHtml = fileURLToPath(new URL("./tester.html", import.meta.url));
const serverReferenceInfoShim = `
import * as original from ${JSON.stringify(serverReferenceInfo)};
export * from ${JSON.stringify(serverReferenceInfo)};
const isNextId = (id) => id.length === original.SERVER_REFERENCE_ID_LENGTH && /^[0-9a-f]+$/i.test(id);
export function mightBeServerReferenceId(id) {
  return typeof id === "string" && (original.mightBeServerReferenceId(id) || id.includes("#"));
}
export function extractInfoFromServerReferenceId(id) {
  return isNextId(id)
    ? original.extractInfoFromServerReferenceId(id)
    : { type: "server-action", usedArgs: [true, true, true, true, true, true], hasRestArgs: true };
}
`;
const devAssetPrefixShim = `export const assetPrefix = "";\n`;
const nodePlatform = createNodePlatform(registry, bridgePrefix);
const saidOfNext = /* @__PURE__ */ new Set();
const fastCryptoPrefix = `${bridgePrefix}fast-crypto/`;
const fastCryptoSetupId = "virtual:vitest-plugin-rsc/next-fast-crypto";
function createLayerResolver(getProject, layer, fastCrypto) {
	let aliases;
	const normalized = /* @__PURE__ */ new Map();
	function nextFile(specifier) {
		return moduleFileAt(path.join(getProject().nextDir, specifier.slice(5)));
	}
	function toSpecifier(file) {
		return `next/${path.relative(getProject().nextDir, file).split(path.sep).join("/")}`;
	}
	function getAliases() {
		if (aliases) return aliases;
		const { nextDir } = getProject();
		const table = { ...getProject().aliases[layer] };
		const flightDir = path.posix.dirname(table["react-server-dom-webpack/server$"]);
		for (const entry of [
			"server.edge",
			"static.edge",
			"client.edge",
			"client.browser"
		]) table[`${vendoredFlight(entry)}$`] = `${flightDir}/${entry}`;
		aliases = Object.entries(table).flatMap(([key, target]) => {
			if (/^next\/dist\/\w+$/.test(key)) return [];
			let exact = key.endsWith("$");
			key = key.replace(/\$$/, "");
			if (path.isAbsolute(key) && !path.relative(nextDir, key).startsWith("..")) {
				key = toSpecifier(key);
				exact = true;
				if (/^next\/[\w-]+\.js$/.test(key)) return [{
					key,
					exact,
					target
				}, {
					key: key.slice(0, -3),
					exact,
					target
				}];
			}
			return [{
				key,
				exact,
				target
			}];
		});
		return aliases;
	}
	function applyAlias(source) {
		for (const { key, exact, target } of getAliases()) {
			if (source !== key && (exact || !source.startsWith(`${key}/`))) continue;
			const aliased = target && target + source.slice(key.length);
			if (aliased && source !== key && aliased.startsWith("next/") && !nextFile(aliased)) continue;
			return aliased;
		}
	}
	function isDependencyOfNext(target) {
		return path.isAbsolute(target) && normalizePath(target).includes("/node_modules/") && path.relative(getProject().nextDir, target).startsWith("..");
	}
	function bridgeOf(source) {
		if (layer === "rsc") {
			const flight = /^react-server-dom-webpack\/(server|static|client)(\.edge)?$/.exec(source);
			if (flight) return `${bridgePrefix}flight-${flight[1]}`;
		}
		if (source === "next/dist/esm/shared/lib/server-reference-info.js") return `${bridgePrefix}server-reference-info`;
		if (devAssetPrefix.test(source)) return `${bridgePrefix}dev-asset-prefix`;
		if (layer === "rsc" && /^next\/dist\/(esm\/)?server\/route-modules\/app-page\/module\.compiled(\.js)?$/.test(source)) return `${bridgePrefix}ssr-app-page-module`;
		if (layer !== "browser") return nodePlatform.moduleOf(source);
	}
	/**
	* Where a specifier leads in this layer: another specifier, a bridge module
	* (`\0...`), or `false` for a module the layer leaves empty. For the app's
	* code, `ofApp`, with the entries Next's own files do not get, like React's
	* `react-dom/server` for Node.js in the ssr layer (project/layers.ts).
	*/
	function normalize(source, ofApp = false) {
		const appTarget = ofApp ? getProject().appAliases[layer][`${source}$`] : void 0;
		if (appTarget !== void 0) return normalize(appTarget);
		const cached = normalized.get(source);
		if (cached !== void 0) return cached;
		const own = layer !== "browser" ? nodeModuleOf(source) : void 0;
		if (own) {
			normalized.set(source, own);
			return own;
		}
		let current = source;
		for (let i = 0; i < 10 && current; i++) {
			const bridge = bridgeOf(current);
			if (bridge) {
				current = bridge;
				break;
			}
			const commonJs = current.replace(/^next\/dist\/esm\//, "next/dist/");
			let next = applyAlias(current) ?? applyAlias(commonJs);
			if (next === void 0 && current.startsWith("next/")) {
				const file = nextFile(commonJs.replace(/^next\/dist\/(?!compiled\/)/, "next/dist/esm/")) ?? nextFile(commonJs);
				if (file) next = toSpecifier(file);
			}
			if (next === void 0 || next === current) break;
			current = next;
		}
		normalized.set(source, current);
		return current;
	}
	/**
	* The name this layer pre-bundles an entry of `optimizeDeps.include` under:
	* the specifier `plugin()` resolves it to, or none for a module the layer
	* leaves empty, bridges, or imports by its file.
	*/
	function preBundledName(entry) {
		const source = entry.slice(entry.lastIndexOf(">") + 1).trim();
		const target = normalize(source, true);
		if (target === false || target.startsWith("\0") || isNodeModule(target)) return;
		if (isDependencyOfNext(target)) return entry;
		if (path.isAbsolute(target)) return;
		return target === source ? entry : target;
	}
	function plugin() {
		return {
			name: `vitest-plugin-rsc:next-resolve:${layer}`,
			enforce: "pre",
			async resolveId(source, importer, options) {
				if (source.startsWith(bridgePrefix) || source === emptyModuleId) return source;
				if (source.startsWith("\0")) return;
				if (layer !== "browser" && fastCrypto()) {
					const name = fastCryptoModuleOf(source);
					if (name && (name !== "node-crypto" || browserMapping(source, importer) === void 0)) return fastCryptoPrefix + name;
				}
				if (importer === `${bridgePrefix}server-reference-info`) return nextFile(serverReferenceInfo);
				if (source === nextRouting) {
					if (!importer || !normalizePath(importer).startsWith(ownDir)) return;
					return this.resolve(source, path.join(getProject().root, "package.json"), {
						...options,
						skipSelf: true
					});
				}
				let specifier = source;
				if (source.startsWith(".") && importer) specifier = path.resolve(path.dirname(importer.split("?")[0]), source);
				if (path.isAbsolute(specifier)) {
					const relative = path.relative(getProject().nextDir, specifier.split("?")[0]);
					if (relative.startsWith("..")) return;
					specifier = `next/${relative.split(path.sep).join("/")}`;
				}
				const ofApp = !!importer && !normalizePath(importer).includes("/next/dist/");
				const target = normalize(specifier, ofApp);
				if (target === false) return emptyModuleId;
				if (isNodeModule(target)) {
					const mapping = browserMapping(source, importer);
					if (mapping === false) return emptyModuleId;
					if (mapping !== void 0) return;
					if (!this.environment) return target;
					return this.resolve(target, importer, {
						...options,
						skipSelf: true
					});
				}
				if (target.startsWith("\0")) return target;
				if (target === source) return;
				if (specifier !== source && target === specifier && !nextFile(target)) return;
				if (isDependencyOfNext(target) && importer && !importer.includes("/node_modules/")) return this.resolve(source, path.join(getProject().nextDir, "package.json"), {
					...options,
					skipSelf: true
				});
				if (this.environment?.mode === "build" && source === specifier && target.startsWith("next/") && !target.startsWith("next/dist/compiled/")) {
					const file = nextFile(target);
					if (file) return normalizePath(file);
				}
				const from = target.startsWith("next/") ? path.join(getProject().root, "package.json") : importer;
				return this.resolve(target, from, {
					...options,
					skipSelf: true
				});
			},
			load(id) {
				if (id === emptyModuleId) return emptyModule;
				if (!id.startsWith(bridgePrefix)) return;
				const name = id.slice(31);
				if (name === "server-reference-info") return serverReferenceInfoShim;
				if (name === "dev-asset-prefix") return devAssetPrefixShim;
				if (id.startsWith(fastCryptoPrefix)) return fastCryptoModule(id.slice(fastCryptoPrefix.length), nodeModuleOf("node:crypto"));
				const { flightExports, version, newExports } = getProject();
				const nodeModule = nodePlatform.load(name, newExports[name], version);
				if (nodeModule) return nodeModule;
				const entry = name.slice(7);
				return flightBridge(entry, flightExports[entry], version, registry);
			}
		};
	}
	return {
		normalize,
		nextFile,
		toSpecifier,
		isDependencyOfNext,
		preBundledName,
		plugin
	};
}
function nextClientBoundaryPlugin(getProject, resolver) {
	return {
		name: "vitest-plugin-rsc:next-client-boundary",
		async transform(code, id) {
			const file = normalizePath(id.split("?")[0]);
			if (!file.startsWith(`${normalizePath(getProject().nextDir)}/`)) return;
			if (!code.includes("use client")) return;
			const specifier = resolver.toSpecifier(file);
			const result = transformDirectiveProxyExport(await parseAstAsync(code), {
				directive: "use client",
				code,
				runtime: (name) => `$$ReactServer.registerClientReference(() => { throw new Error(${JSON.stringify(`${specifier}#${name} is a Client Component and cannot be called on the server`)}) }, ${JSON.stringify(`/@id/${specifier}`)}, ${JSON.stringify(name)})`
			});
			if (!result) return;
			result.output.prepend(`import * as $$ReactServer from ${JSON.stringify(vendoredFlight("server.edge"))};\n`);
			return {
				code: result.output.toString(),
				map: null
			};
		}
	};
}
function flightConsolePlugin() {
	return {
		name: "vitest-plugin-rsc:flight-console",
		transform: {
			filter: { id: /\/react-server-dom-webpack-server\.[^/]+\.development\.js$/ },
			handler(code, id) {
				const patched = code.replace(/function patchConsole\([^)]*\)\s*\{/, "$& return;");
				if (patched === code) this.warn(`vitest-plugin-rsc: React's patchConsole() in ${id} is not turned off.`);
				return {
					code: patched,
					map: null
				};
			}
		}
	};
}
function nextPatchesPlugin() {
	const patches = nextPatches(registry);
	return {
		name: "vitest-plugin-rsc:next-patches",
		transform: {
			filter: { id: { include: patches.map(({ file }) => file) } },
			handler(code, id) {
				let patched = code;
				for (const { file, lost, edits } of patches) {
					if (!file.test(id)) continue;
					for (const [find, replace] of edits) {
						if (!patched.includes(find)) {
							this.warn(`vitest-plugin-rsc: ${id} has no \`${find.trim()}\`: ${lost}.`);
							continue;
						}
						patched = patched.replaceAll(find, () => replace);
					}
				}
				return patched === code ? void 0 : {
					code: patched,
					map: null
				};
			}
		}
	};
}
function definesOf(project, layer) {
	const { "process.env.NODE_ENV": _, ...defines } = project.defines[layer];
	return {
		...defines,
		__dirname: "\"\"",
		...layer === "browser" && {
			__webpack_require__: `${registry}.browserRequire`,
			"process.env.__NEXT_TEST_MODE": "true"
		}
	};
}
function findMetadataRequests(code) {
	return [...code.matchAll(/["'](next-metadata-(?:image|route)-loader\?[^"']+)["']/g)].map((match) => match[1]);
}
/**
* The files of the cache handlers that `next.config` names, which Next's
* server loads before its first request (cache.ts): `cacheHandler`, and one
* of `cacheHandlers` for each kind of `"use cache"` that has one. A path, or
* a `file:` URL, as Next takes one. A relative path is of the project, as
* Next's server resolves it.
*/
function cacheHandlerFilesOf(project) {
	const { cacheHandler, cacheHandlers = {} } = project.config;
	const fileOf = (file) => normalizePath(file.startsWith("file:") ? fileURLToPath(file) : path.resolve(project.root, file));
	return {
		cacheHandler: cacheHandler ? fileOf(cacheHandler) : void 0,
		cacheHandlers: Object.fromEntries(Object.entries(cacheHandlers).flatMap(([kind, file]) => file ? [[kind, fileOf(file)]] : []))
	};
}
/**
* What the dependency optimizer of the ssr layer, which loads the cache
* handlers, is to know of them before the first request. Vite's scan does not
* follow the `import()` of a file that a virtual module makes from the
* config. A file of Next, like its `default.external.js`, is a dependency:
* the layer imports it by the specifier `toSpecifier()` gives it. Any other
* file, of the app or of another package, is an entry of the scan, which
* then finds what it imports.
*/
function cacheHandlerScan(project, toSpecifier) {
	const { cacheHandler, cacheHandlers } = cacheHandlerFilesOf(project);
	const files = [...new Set([cacheHandler ?? [], Object.values(cacheHandlers)].flat())];
	const isOfNext = (file) => {
		const relative = path.relative(project.nextDir, file);
		return !relative.startsWith("..") && !path.isAbsolute(relative);
	};
	return {
		include: files.filter(isOfNext).map(toSpecifier),
		entries: files.filter((file) => !isOfNext(file)).map(fileEntry)
	};
}
function findImports(code) {
	return [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(?:\/\*.*?\*\/\s*)?["']([^"'?!]+)["']/g)].map((match) => match[1]);
}
const clientBoundaryFiles = /* @__PURE__ */ new Map();
function findClientBoundaries(nextDir, root, resolver) {
	let files = clientBoundaryFiles.get(nextDir);
	if (!files) {
		files = scanClientBoundaries(nextDir, root);
		clientBoundaryFiles.set(nextDir, files);
	}
	return files.map((file) => resolver.toSpecifier(file)).sort();
}
function scanClientBoundaries(nextDir, root) {
	const scripts = fs.readdirSync(path.join(nextDir, "dist/esm"), {
		recursive: true,
		withFileTypes: true
	}).flatMap((entry) => entry.isFile() && entry.name.endsWith(".js") ? [path.join(entry.parentPath, entry.name)] : []);
	const key = createHash("sha256");
	for (const file of scripts) {
		const stats = fs.statSync(file, { throwIfNoEntry: false });
		key.update(`${file}\0${stats?.size}\0${stats?.mtimeMs}\n`);
	}
	const cache = path.join(root, "node_modules/.cache/vitest-plugin-rsc/client-boundaries-1.json");
	const digest = key.digest("hex");
	try {
		const cached = JSON.parse(fs.readFileSync(cache, "utf8"));
		if (cached.key === digest) return cached.files;
	} catch {}
	const files = scripts.filter((file) => {
		const code = fs.readFileSync(file, "utf8");
		return code.includes("use client") && hasDirective(parseAst(code).body, "use client");
	});
	try {
		fs.mkdirSync(path.dirname(cache), { recursive: true });
		const written = `${cache}.${process.pid}`;
		fs.writeFileSync(written, JSON.stringify({
			key: digest,
			files
		}));
		fs.renameSync(written, cache);
	} catch {}
	return files;
}
const react = [
	"react",
	"react/jsx-runtime",
	"react/jsx-dev-runtime",
	"react/compiler-runtime"
];
const runtimeImports = {
	rsc: [
		...react,
		"react-dom",
		...runtimeImports$1.rsc,
		vendoredFlight("server.edge"),
		vendoredFlight("static.edge"),
		vendoredFlight("client.edge")
	],
	ssr: [
		...react,
		"react-dom",
		...runtimeImports$1.ssr,
		vendoredFlight("client.edge"),
		"next/navigation"
	],
	browser: [
		...react,
		"react-dom",
		"react-dom/client",
		...runtimeImports$1.browser,
		"next/navigation",
		vendoredFlight("client.browser")
	]
};
function vitestPluginNext(options = {}) {
	const fastOption = resolveFast(options.fast, process.env);
	let fast = {
		...fastOption,
		crypto: false
	};
	let project;
	let cssDifferences = [];
	const serverCode = createServerCode(registry, options);
	const getProject = () => project;
	if (options.build !== void 0 && !nextBuilds.includes(options.build)) throw new Error(`vitest-plugin-rsc: \`build\` is "development" or "production", not ${JSON.stringify(options.build)}.`);
	let build = options.build ?? "development";
	let env;
	let envLoad = Promise.resolve();
	let server;
	let cacheHandlerEntries = [];
	let underVitest = false;
	const pluginApis = /* @__PURE__ */ new WeakMap();
	const clientReferenceOf = (id, config) => {
		if (!pluginApis.has(config)) pluginApis.set(config, getPluginApi(config));
		const references = pluginApis.get(config)?.manager.clientReferenceMetaMap;
		return references && clientReferenceOfModule(references, id);
	};
	const hostPackagesPlugin = {
		name: "vitest-plugin-rsc:next-host-packages",
		resolveId: (source) => serverCode.isHostPackage(source) ? {
			id: source,
			external: true
		} : void 0
	};
	const resolvers = Object.fromEntries(layers.map((layer) => [layer, createLayerResolver(getProject, layer, () => fast.crypto)]));
	let pageRoutes;
	const styles = createStyles({
		getProject,
		environments: environmentOf,
		isServerCode: (file) => serverCode.isServerCode(file, "rsc"),
		isHostFile: serverCode.isHostFile,
		pageRoutes() {
			if (pageRoutes?.of !== project) {
				const routes = [...project.routes, ...project.componentRoutes].flatMap((route) => route.kind === "page" ? [[entryOf(route), route]] : []);
				pageRoutes = {
					of: project,
					routes: new Map(routes)
				};
			}
			return pageRoutes.routes;
		},
		entryIdOf: (entry) => `\0${routeEntryPrefix}${[...project.routes, ...project.componentRoutes].findIndex((route) => route.kind === "page" && entryOf(route) === entry)}`,
		lists: routeKinds.map((kind) => `\0${routeLists[kind]}`)
	});
	const generatedDefines = () => ({
		...definesOf(project, "rsc"),
		...build === "production" && { "process.env.NODE_ENV": "\"production\"" }
	});
	return [
		{
			name: "vitest-plugin-rsc:next-scan",
			configureServer: {
				order: "pre",
				handler(server) {
					const rsc = server.config.environments[environmentOf.rsc];
					const input = rsc.input ?? rsc.build.rolldownOptions.input;
					const inputFiles = typeof input === "string" ? [input] : Object.values(input ?? {});
					const hostEntries = rsc.optimizeDeps.entries ?? (inputFiles.length > 0 ? inputFiles.map(fileEntry) : "**/*.html");
					rsc.optimizeDeps.entries = [
						...[hostEntries].flat(),
						appEntriesOf(project),
						...project.middlewareFile ? [fileEntry(project.middlewareFile)] : []
					];
					const ssr = server.config.environments[environmentOf.ssr];
					const isOwnOrPackageFile = (entry) => {
						const file = normalizePath(entry);
						return file.includes("/node_modules/") || file.startsWith(ownDir);
					};
					ssr.optimizeDeps.entries = [
						...[ssr.optimizeDeps.entries ?? []].flat(),
						...rsc.optimizeDeps.entries.filter((entry) => !isOwnOrPackageFile(entry)),
						...cacheHandlerEntries
					];
				}
			}
		},
		...createRunnerEnvironmentPlugins(environmentOf.ssr),
		createPathsPlugin(getProject),
		{
			name: "vitest-plugin-rsc:next",
			enforce: "pre",
			async config(config, { command }) {
				const isBuild = command === "build";
				build = options.build ?? (isBuild ? "production" : "development");
				const crypto = fastOption.crypto && !isBuild && process.env.VITEST !== void 0;
				fast = {
					...fastOption,
					crypto
				};
				project = await loadNextProject(path.resolve(config.root ?? process.cwd()), void 0, {
					build,
					static: isBuild
				});
				serverCode.configure(project.root);
				env = project.env;
				if (isBuild) serverCode.addTestFiles(() => false);
				const appPageEntries = await Promise.all([...project.routes, ...project.componentRoutes.slice(0, 1)].map((candidate) => project.loadRouteEntry(candidate)));
				const metadataModules = await Promise.all([...new Set(appPageEntries.flatMap(({ code }) => findMetadataRequests(code)))].map((request) => project.loadMetadata(request)));
				const entryImports = [
					...appPageEntries.flatMap(({ code }) => findImports(code)),
					...metadataModules.flatMap(({ code }) => findImports(code)),
					...findImports(await project.loadMiddlewareEntry() ?? ""),
					...findImports(await project.loadRootParams())
				];
				const cacheHandlers = cacheHandlerScan(project, resolvers.ssr.toSpecifier);
				cacheHandlerEntries = cacheHandlers.entries;
				const apiImports = (layer) => Object.entries(project.aliases[layer]).flatMap(([file, target]) => path.dirname(file) === project.nextDir && target && !file.endsWith("og.js") ? [target] : []);
				const toInclude = (layer, sources) => [...new Set(sources.flatMap((source) => {
					const target = resolvers[layer].normalize(source);
					return target && target.startsWith("next/dist/") ? [target] : [];
				}))];
				const rscInclude = toInclude("rsc", [
					...entryImports,
					...apiImports("rsc"),
					...runtimeImports.rsc,
					...build === "production" ? prerenderImports : []
				]);
				const clientBoundaries = findClientBoundaries(project.nextDir, project.root, resolvers.rsc);
				const include = {
					rsc: [...rscInclude, nextRouting],
					ssr: [...toInclude("ssr", [
						...apiImports("ssr"),
						...runtimeImports.ssr,
						...clientBoundaries,
						...cacheHandlers.include
					]), nextRouting],
					browser: toInclude("browser", [
						...apiImports("browser"),
						...runtimeImports.browser,
						...clientBoundaries
					])
				};
				const dependenciesOfNext = (layer) => Object.entries(project.aliases[layer]).flatMap(([key, target]) => key.endsWith("$") && target && resolvers[layer].isDependencyOfNext(target) ? [`next > ${key.slice(0, -1)}`] : []);
				const optimizeDeps = (layer) => ({
					include: [
						...include[layer],
						...dependenciesOfNext(layer),
						...project.webpackPackages[layer]
					],
					rolldownOptions: {
						plugins: [
							...build === "production" ? [nextProductionPlugin(project.nextDir)] : [],
							...layer === "browser" ? [hostPackagesPlugin] : [],
							resolvers[layer].plugin(),
							createDependencyCompilePlugin(getProject, layer, serverCode.isAppCode),
							createScanCompilePlugin(getProject, layer, serverCode.isAppCode),
							...layer === "rsc" ? [nextClientBoundaryPlugin(getProject, resolvers.rsc)] : [],
							flightConsolePlugin(),
							nextPatchesPlugin(),
							...layer === "browser" ? [] : [
								instrumentationPlugin(),
								serverCode.optimizerPlugin(layer),
								serverCode.asyncFunctionsOptimizerPlugin(layer)
							]
						],
						shimMissingExports: true,
						moduleTypes: { ".js": "jsx" },
						transform: { define: {
							...definesOf(project, layer),
							...layer === "browser" ? serverCode.browserCacheKey : serverCode.cacheKey,
							...optimizerCacheKey(project, layer),
							__vitest_plugin_rsc_fast_crypto__: JSON.stringify(fast.crypto)
						} }
					}
				});
				const css = await project.loadCssOptions();
				cssDifferences = [...css.differences];
				const cssOptions = { ...css.options };
				if (config.css?.preprocessorOptions !== void 0 && cssOptions.preprocessorOptions) {
					delete cssOptions.preprocessorOptions;
					cssDifferences.push("`css.preprocessorOptions` of the Vitest config is used, not `sassOptions` of next.config");
				}
				if (config.css?.transformer === "lightningcss") {
					delete cssOptions.postcss;
					delete cssOptions.modules;
					cssDifferences.push("`css.transformer` of the Vitest config compiles the CSS with Lightning CSS: not with Next's PostCSS plugins, its mode of a CSS module or its class names");
				} else {
					if (config.css?.postcss !== void 0) {
						delete cssOptions.postcss;
						cssDifferences.push("`css.postcss` of the Vitest config is used, not Next's PostCSS plugins, nor Next's mode of a CSS module");
					}
					if (config.css?.modules !== void 0) {
						delete cssOptions.modules;
						cssDifferences.push("`css.modules` of the Vitest config names the classes of a CSS module, not Next's rule");
					}
				}
				const test = config.test ??= {};
				test.setupFiles = [setupFile, ...[test.setupFiles ?? []].flat()];
				(test.browser ??= {}).testerHtmlPath ??= testerHtml;
				test.browser.dependencySourcemaps ??= false;
				if (fast.watchDom) ((test.expect ??= {}).poll ??= {}).interval ??= 5;
				const jsx = build === "production" && config.oxc !== false && typeof config.oxc?.jsx !== "string" ? { oxc: { jsx: { development: false } } } : {};
				const nodeEnv = JSON.stringify(build);
				const builtLayer = (layer) => isBuild && {
					define: {
						"process.env.NODE_ENV": nodeEnv,
						"global.process.env.NODE_ENV": nodeEnv,
						"globalThis.process.env.NODE_ENV": nodeEnv,
						...layer === "browser" && { __vite_rsc_require__: `${registry}.browserRequire` }
					},
					build: { rolldownOptions: { shimMissingExports: true } }
				};
				return {
					...jsx,
					css: cssOptions,
					environments: {
						[environmentOf.rsc]: {
							...builtLayer("rsc"),
							optimizeDeps: optimizeDeps("rsc")
						},
						[environmentOf.ssr]: {
							...builtLayer("ssr"),
							consumer: "client",
							resolve: { conditions: [
								...(config.resolve?.conditions ?? []).filter((condition) => condition === "vitest-plugin-rsc-source"),
								"module",
								"browser",
								"development|production"
							] },
							dev: { moduleRunnerTransform: true },
							optimizeDeps: {
								...optimizeDeps("ssr"),
								exclude: ["vitest-plugin-rsc", "@vitejs/plugin-rsc"]
							}
						},
						[environmentOf.browser]: {
							...builtLayer("browser"),
							optimizeDeps: optimizeDeps("browser")
						}
					}
				};
			},
			configureServer(vite) {
				server = vite;
				const mainApp = "static/chunks/main-app.js";
				vite.middlewares.use((request, response, next) => {
					const { pathname } = new URL(request.url ?? "/", "http://n");
					if (pathname !== `${project.assetPath}${mainApp}`) return next();
					send(request, response, "", "js", {
						headers: vite.config.server.headers,
						map: { mappings: "" }
					});
				});
			},
			configEnvironment: {
				order: "post",
				handler(name, config, { command }) {
					const layer = layers.find((layer) => environmentOf[layer] === name);
					if (!layer) return;
					const optimizeDeps = config.optimizeDeps;
					if (optimizeDeps?.include) optimizeDeps.include = [...new Set(optimizeDeps.include.flatMap((entry) => resolvers[layer].preBundledName(entry) ?? []))];
					if (command === "build") return { keepProcessEnv: true };
				}
			},
			configResolved(config) {
				config.logger.info(describeEnv(env, config.command === "build"));
				for (const difference of [...cssDifferences, ...project.webpackDifferences]) config.logger.warnOnce(`vitest-plugin-rsc: ${difference}.`);
				if (project.edgeRouteFiles.length > 0) config.logger.warnOnce(`vitest-plugin-rsc: Next.js has deprecated its edge runtime. These routes ask for it with \`export const runtime = "edge"\` and run on Node.js here, like the others: ${project.edgeRouteFiles.join(", ")}`);
				const newExports = Object.values(project.newExports).flat();
				const aboutNext = `vitest-plugin-rsc: next@${project.version} has exports that the plugin's stand-ins for its modules have not. Each throws when it is used: ` + newExports.map(({ name, module }) => `\`${name}\` of ${module}`).join(", ") + `. Use a version of vitest-plugin-rsc that supports next@${project.version}.`;
				if (newExports.length > 0 && !saidOfNext.has(aboutNext)) {
					saidOfNext.add(aboutNext);
					config.logger.warn(aboutNext);
				}
				if (project.unmatchedRoutes.length > 0) config.logger.warnOnce("vitest-plugin-rsc: @next/routing does not find a dynamic route under a folder with a name that a URL percent-encodes. These routes get the not-found page: " + project.unmatchedRoutes.join(", "));
			},
			configureVitest({ vitest, project: testProject }) {
				underVitest = true;
				assertVitestVersion(vitest.version);
				const test = testProject.config;
				const isSetupFile = (file) => test.setupFiles.some((setupFile) => normalizePath(setupFile) === file);
				const isIncluded = createFilter(test.include, test.exclude, { resolve: test.dir || test.root });
				serverCode.addTestFiles((file) => isSetupFile(file) || isIncluded(file));
			},
			async hotUpdate({ file, modules }) {
				if (underVitest) return;
				if (envFilesOf(false).some((name) => normalizePath(path.join(project.root, name)) === file)) {
					if (this.environment.name !== environmentOf.rsc) return [];
					const loaded = envLoad.then(() => project.loadEnv());
					envLoad = loaded.catch(() => {});
					env = await loaded;
					for (const environment of Object.values(server?.environments ?? {})) {
						const envModule = environment.moduleGraph.getModuleById(`\0${envId}`);
						if (envModule) environment.moduleGraph.invalidateModule(envModule);
					}
					this.environment.logger.info(`page reload ${path.relative(this.environment.config.root, file)} (vitest-plugin-rsc: an env file changed)`, { timestamp: true });
					this.environment.hot.send({
						type: "full-reload",
						path: "*",
						triggeredBy: file
					});
					return [];
				}
				if (this.environment.name !== environmentOf.rsc) return;
				if (!modules.some(importedByRoute)) return;
				this.environment.logger.info(`page reload ${path.relative(this.environment.config.root, file)} (vitest-plugin-rsc: a file of the app changed)`, { timestamp: true });
				this.environment.hot.send({
					type: "full-reload",
					path: "*",
					triggeredBy: file
				});
				return [];
			},
			resolveId(source) {
				if (source === manifestId || source === envId || isRouteModule(source)) return `\0${source}`;
				if (source === fastCryptoSetupId) return `\0${source}`;
				if (source === middlewareId || source === middlewareEntryId) return `\0${source}`;
				if (source === "virtual:vitest-plugin-rsc/next-use-cache" || source === cacheHandlersId) return `\0${source}`;
				if (source === prerenderId) return `\0${source}`;
				if (source === "next/root-params") return `\0${rootParamsId}`;
				if (project.isMetadataRequest(source)) return `\0${metadataPrefix}${source}`;
				if (source.endsWith(project.metadataImageMeta)) return source.slice(0, -project.metadataImageMeta.length);
			},
			async load(id) {
				if (id.startsWith(`\0${metadataPrefix}`)) {
					const { code, watchFiles } = await project.loadMetadata(id.slice(metadataPrefix.length + 1));
					for (const file of watchFiles) this.addWatchFile(file);
					return serverCode.compile(code, "next-metadata.js", generatedDefines());
				}
				if (id === `\0virtual:vitest-plugin-rsc/next-use-cache`) return useCacheModule(registry);
				if (id === `\0${rootParamsId}`) return project.loadRootParams();
				if (id === `\0${prerenderId}`) return build === "production" ? `export { prerenderVerdictOf } from ${JSON.stringify(ownFile("prerender-verdict"))};\n` : "export function prerenderVerdictOf() {\n  throw new Error('vitest-plugin-rsc: only `build: \"production\"` prerenders');\n}\n";
				if (id === `\0${cacheHandlersId}`) {
					const { cacheHandler, cacheHandlers } = cacheHandlerFilesOf(project);
					const load = (file) => `() => import(${JSON.stringify(file)})`;
					const kinds = Object.entries(cacheHandlers).map(([kind, file]) => `  ${JSON.stringify(kind)}: ${load(file)},`);
					return `export const cacheHandler = ${cacheHandler ? load(cacheHandler) : "undefined"};\nexport const cacheHandlers = {\n${kinds.join("\n")}\n};\n`;
				}
				if (id === `\0${fastCryptoSetupId}`) return fastCryptoSetup(fast.crypto);
				if (id === `\0${envId}`) {
					for (const name of env.files) this.addWatchFile(path.join(project.root, name));
					return `export default ${JSON.stringify(env.values)};\n`;
				}
				if (id === `\0${manifestId}`) {
					const routes = project.routes.map(({ kind, page, pathname }) => ({
						kind,
						page,
						pathname
					}));
					return `export const routes = ${JSON.stringify([...routes, ...project.componentRoutes])};\nexport const nextConfig = ${JSON.stringify(this.environment.mode === "build" ? withPathsFromRoot(project.config, project.root) : project.config)};\nexport const routing = ${JSON.stringify(project.routing)};\nexport const routesManifest = ${JSON.stringify(project.routesManifest)};\nexport const preview = ${JSON.stringify(project.preview)};\nexport const build = ${JSON.stringify(build)};\nexport const fast = ${JSON.stringify(fast)};\n`;
				}
				const hasMiddleware = project.middlewareFile !== void 0 && this.environment.name === environmentOf.rsc;
				if (id === `\0${middlewareId}`) {
					if (!hasMiddleware) return "export default undefined;\n";
					const entry = JSON.stringify(middlewareEntryId);
					return `export default () => import(${entry});\n${hmrBoundary([entry])}`;
				}
				if (id === `\0${middlewareEntryId}`) {
					const code = hasMiddleware && await project.loadMiddlewareEntry();
					if (!code) return "export {};";
					return serverCode.compile(code, "next-middleware-entry.js", generatedDefines());
				}
				if (!id.startsWith("\0") || !isRouteModule(id.slice(1))) return;
				if (this.environment.name !== environmentOf.rsc) return "export default {};";
				const routes = [...project.routes, ...project.componentRoutes];
				const listed = routeKinds.find((kind) => id === `\0${routeLists[kind]}`);
				if (listed) {
					const entries = routes.flatMap((route, index) => route.kind === listed ? [{
						name: JSON.stringify(entryOf(route)),
						entry: JSON.stringify(routeEntryPrefix + index)
					}] : []);
					return `export default {\n${entries.map(({ name, entry }) => `  ${name}: () => import(${entry}),`).join("\n")}\n};\n${hmrBoundary(entries.map(({ entry }) => entry))}`;
				}
				const route = routes[Number(id.slice(routeEntryPrefix.length + 1))];
				const entry = await project.loadRouteEntry(route);
				for (const file of entry.watchFiles) this.addWatchFile(file);
				return serverCode.compile(entry.code, `${id.replace(/\W+/g, "-")}.js`, generatedDefines());
			}
		},
		...clientFiles({
			environments: {
				rsc: environmentOf.rsc,
				browser: environmentOf.browser
			},
			testingLibrary,
			clientComponents: "vitest-plugin-rsc/nextjs/client-components",
			internal: ownFile("internal"),
			isHostFile: serverCode.isHostFile,
			isTestFile: serverCode.isTestFile,
			isHostPackage: serverCode.isHostPackage,
			clientReferenceOf
		}),
		serverCode.plugin({
			[environmentOf.rsc]: "rsc",
			[environmentOf.ssr]: "ssr"
		}),
		pageTimersPlugin(environmentOf.browser, serverCode.isHostFile),
		...styles.plugins,
		serverCode.asyncFunctionsPlugin(environmentOf.rsc),
		createUseCachePlugin(getProject, (environment) => layers.find((layer) => environmentOf[layer] === environment), serverCode.isAppCode),
		createCompilePlugin(getProject, (environment) => layers.find((layer) => environmentOf[layer] === environment), serverCode.isAppCode),
		createCommonJsPlugin((environment) => layers.find((layer) => environmentOf[layer] === environment), serverCode.isAppCode),
		...layers.map((layer) => ({
			...resolvers[layer].plugin(),
			applyToEnvironment: (environment) => environment.name === environmentOf[layer]
		})),
		...layers.map((layer) => dependencyBuildPlugin(getProject, serverCode, layer)),
		{
			...flightConsolePlugin(),
			apply: "build"
		},
		{
			...nextPatchesPlugin(),
			apply: "build"
		},
		{
			...instrumentationPlugin(),
			apply: "build"
		},
		nextStaticBuild({
			environments: environmentOf,
			entries: {
				ssr: "vitest-plugin-rsc/nextjs/ssr",
				browser: "vitest-plugin-rsc/nextjs/client"
			},
			emittedFiles: () => [...project.emittedFiles(), ...styles.builtFiles()],
			rscModule: ownFile("rsc"),
			isHostFile: (id) => builtHostFileOf(id, project.root, serverCode.isHostFile) !== void 0
		})
	];
}
function dependencyBuildPlugin(getProject, serverCode, layer) {
	const compile = createDependencyCompilePlugin(getProject, layer, serverCode.isAppCode);
	return {
		name: `vitest-plugin-rsc:next-build-dependency:${layer}`,
		apply: "build",
		applyToEnvironment: (environment) => environment.name === environmentOf[layer],
		async transform(code, id) {
			const file = id.split("?")[0];
			if (!normalizePath(file).includes("/node_modules/") || !/\.[cm]?js$/.test(file)) return;
			const compiled = await compile.transform(code, file);
			const isServerCode = layer !== "browser" && serverCode.isServerCode(file, layer);
			const forStores = isServerCode ? serverCode.forStores(this, compiled?.code ?? code, file, layer) : void 0;
			const source = forStores?.code ?? compiled?.code ?? code;
			const kept = source === (compiled?.code ?? code) ? compiled : { code: source };
			const define = Object.fromEntries(Object.entries(definesOf(getProject(), layer)).filter(([key]) => source.includes(key.replace(/^typeof /, ""))));
			if (!isServerCode && Object.keys(define).length === 0) return kept;
			try {
				return (isServerCode ? await compileServerCode(source, file, registry, {
					...define,
					...forStores?.define
				}) : await transformWithOxc(source, file, {
					lang: "js",
					define
				})) ?? kept;
			} catch (error) {
				const reason = String(error instanceof Error ? error.message : error);
				this.warn(`vitest-plugin-rsc: ${file} keeps the constants of Next's ${layer} layer, it does not parse as JavaScript. ${reason.replace(/\s+/g, " ")}`);
				return kept;
			}
		}
	};
}
//#endregion
export { vitestPluginNext };
