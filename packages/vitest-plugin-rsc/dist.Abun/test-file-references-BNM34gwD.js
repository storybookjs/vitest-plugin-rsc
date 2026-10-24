import { c as builtHostModuleUrl, f as isHostModule, l as hostModulePrefix, m as clientReferencesId, u as hostModuleSpecifier } from "./websocket-bridge-20VEq6PG.js";
import module from "node:module";
import { Visitor, moduleRunnerTransform, parseAstAsync } from "vite";
import { getPluginApi } from "@vitejs/plugin-rsc/plugin";
import fs from "node:fs";
import path from "node:path";
//#region src/compile-cache.ts
try {
	module.enableCompileCache?.();
	setTimeout(() => {
		try {
			module.flushCompileCache?.();
		} catch {}
	}, 1e4).unref();
} catch {}
//#endregion
//#region src/runner-environment.ts
function createRunnerEnvironmentPlugins(name) {
	return [{
		name: `rsc:runner-environment-optimizer:${name}`,
		configureServer(server) {
			const client = server.config.environments.client;
			const environment = server.config.environments[name];
			environment.optimizeDeps.entries ??= client.optimizeDeps.entries;
			environment.optimizeDeps.exclude = [.../* @__PURE__ */ new Set([...client.optimizeDeps.exclude ?? [], ...environment.optimizeDeps.exclude ?? []])];
		}
	}];
}
//#endregion
//#region src/static-build.ts
/** What the page imports for the layers that were built: see utils.ts. */
const layersId = "virtual:vitest-plugin-rsc/layers";
/** For the rsc layer: the modules with Server Actions. */
const serverReferencesId = "virtual:vitest-plugin-rsc/server-references";
/** Where the layers of the module runner are, in the directory of the build. */
const layersDir = "vitest-plugin-rsc";
/**
* The file with every module of a layer. Not named after its content: the
* build of the host, which says where it is, comes before the layer's, which
* needs the ids that the host's build gives. So it is a file, like the
* `index.html` of the host, that a site serves without a long cache.
*/
const modulesFile = "modules.json";
/** Where that file of a layer is, in the directory of the build. */
const modulesPath = (layer) => `${layersDir}/${layer}/${modulesFile}`;
const buildDirPlaceholder = "__VITEST_PLUGIN_RSC_BUILD_DIR__";
const cssBuildDirPlaceholder = "//vitest-plugin-rsc-build-dir";
const toBuildDir = (fileName) => `${path.posix.relative(path.posix.dirname(fileName), "") || "."}/`;
/**
* The code of a module, or the CSS, that names files of the build by their
* path from its directory, like `/_next/static/media/logo.png`: with a URL
* that is right wherever the build is served.
*/
function withBuiltFiles(code, pathnames, language) {
	if (pathnames.length === 0) return code;
	if (language === "css") {
		const paths = [...pathnames].sort((a, b) => b.length - a.length);
		const pattern = new RegExp(paths.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
		return code.replace(pattern, (pathname) => cssBuildDirPlaceholder + pathname);
	}
	for (const pathname of pathnames) code = code.replaceAll(JSON.stringify(pathname), `new URL(${buildDirPlaceholder} + ${JSON.stringify(pathname.slice(1))}, import.meta.url).href`);
	return code;
}
function referenceList(references) {
	return `export default {\n${[...references].sort((a, b) => a.referenceKey < b.referenceKey ? -1 : 1).map(({ referenceKey, importId }) => `  ${JSON.stringify(referenceKey)}: () => import(${JSON.stringify(importId)}),`).join("\n")}\n};\n`;
}
const staticBuildKey = "vitestPluginRscStaticBuild";
/** The config with which a framework's plugin builds its own layers: see `staticBuild()`. */
function withStaticBuild(layers) {
	return { [staticBuildKey]: layers };
}
async function toRunnerModule(chunk) {
	const id = `/${chunk.fileName}`;
	const source = await runnerSource(chunk.code, path.posix.dirname(id));
	return (await moduleRunnerTransform(source, null, id, source))?.code ?? source;
}
async function runnerSource(code, directory) {
	const sources = [];
	let resolvesImportMeta = false;
	const add = (source) => {
		const specifier = source?.type === "Literal" ? source.value : source?.type === "TemplateLiteral" && source.expressions.length === 0 ? source.quasis[0].value.cooked : void 0;
		if (typeof specifier === "string" && /^\.\.?\//.test(specifier)) sources.push({
			start: source.start,
			end: source.end,
			specifier
		});
	};
	new Visitor({
		ImportDeclaration: (node) => add(node.source),
		ExportAllDeclaration: (node) => add(node.source),
		ExportNamedDeclaration: (node) => add(node.source),
		ImportExpression: (node) => add(node.source),
		MemberExpression: (node) => {
			const { object, property } = node;
			if (object.type === "MetaProperty" && object.meta.name === "import" && property.type === "Identifier" && property.name === "resolve") resolvesImportMeta = true;
		}
	}).visit(await parseAstAsync(code));
	for (const { start, end, specifier } of sources.sort((a, b) => b.start - a.start)) {
		const resolved = JSON.stringify(path.posix.resolve(directory, specifier));
		code = code.slice(0, start) + resolved + code.slice(end);
	}
	return resolvesImportMeta ? `import.meta.resolve = (specifier) => new URL(specifier, import.meta.url).href;\n${code}` : code;
}
function hostModulesOf(bundle) {
	const found = /* @__PURE__ */ new Set();
	for (const output of Object.values(bundle)) {
		if (output.type !== "chunk") continue;
		for (const id of [...output.imports, ...output.dynamicImports]) if (isHostModule(id)) found.add(hostModuleSpecifier(id));
	}
	return found;
}
function reaches(chunk, id, bundle) {
	const seen = /* @__PURE__ */ new Set();
	const queue = [chunk];
	for (const current of queue) {
		if (current.moduleIds.includes(id)) return true;
		for (const fileName of [...current.imports, ...current.dynamicImports]) {
			const next = bundle[fileName];
			if (next?.type === "chunk" && !seen.has(fileName)) {
				seen.add(fileName);
				queue.push(next);
			}
		}
	}
	return false;
}
const countOf = (layers) => ["two", "three"][layers - 2] ?? String(layers);
/**
* The static build of the app, for `vite build`. With a dev server it only
* says that there is no build: the lists of references and of the layers are
* `undefined`, and the page asks the server.
*/
function staticBuild(options) {
	const { rsc, browser } = options;
	let layers = options.layers;
	const runnerLayers = () => Object.keys(layers.entries);
	const fetchOrder = () => [browser, ...runnerLayers().filter((name) => name !== browser).sort()];
	let manager;
	let base = "/";
	let root = "/";
	const built = /* @__PURE__ */ new Map();
	let buildingApp = false;
	let hostModules = /* @__PURE__ */ new Set();
	let listedOnly = /* @__PURE__ */ new Set();
	const parsed = /* @__PURE__ */ new Map();
	const directiveOf = ({ id, pos }) => {
		const code = id === void 0 ? void 0 : parsed.get(id)?.code;
		if (!code || pos === void 0) return void 0;
		const quote = code[pos];
		if (quote !== "\"" && quote !== "'") return void 0;
		const end = code.indexOf(quote, pos + 1);
		return end === -1 ? void 0 : code.slice(pos + 1, end);
	};
	const inputOf = (name) => ({
		entry: layers.entries[name],
		...name === browser && { references: "virtual:vitest-plugin-rsc/client-references" }
	});
	const environment = (builder, name) => {
		const found = builder.environments[name];
		if (!found) throw new Error(`vitest-plugin-rsc: the build has no environment "${name}"`);
		return found;
	};
	return {
		name: "vitest-plugin-rsc:static-build",
		enforce: "pre",
		config: {
			order: "post",
			handler(userConfig, { command }) {
				if (command !== "build") return;
				layers = userConfig[staticBuildKey] ?? options.layers;
				if (!layers.entries[browser]) throw new Error(`vitest-plugin-rsc: a static build has no entry of "${browser}".`);
				if (userConfig.build?.watch) throw new Error("vitest-plugin-rsc: a static build of the app cannot watch. Build it again instead of `vite build --watch`.");
				const userOnwarn = userConfig.build?.rolldownOptions?.onwarn;
				const userRenderBuiltUrl = userConfig.experimental?.renderBuiltUrl;
				const directives = /* @__PURE__ */ new Set([
					"use client",
					"use server",
					...layers.directives ?? []
				]);
				const layer = (name) => ({ build: {
					copyPublicDir: false,
					modulePreload: false,
					assetsDir: `${layersDir}/${name}/assets`,
					cssCodeSplit: name === browser,
					rolldownOptions: {
						output: {
							entryFileNames: `${layersDir}/${name}/[name].js`,
							assetFileNames: `${layersDir}/${browser}/assets/[name]-[hash][extname]`
						},
						preserveEntrySignatures: "strict"
					}
				} });
				return {
					builder: {
						sharedPlugins: true,
						sharedConfigBuild: true
					},
					experimental: { renderBuiltUrl(filename, context) {
						const own = userRenderBuiltUrl?.(filename, context);
						if (!buildingApp || context.hostType !== "css" || typeof own === "string") return own;
						return `${cssBuildDirPlaceholder}/${filename}`;
					} },
					build: { rolldownOptions: {
						...layers.strictExecutionOrder && { output: { strictExecutionOrder: true } },
						onwarn(warning, warn) {
							const isDirective = warning.code === "MODULE_LEVEL_DIRECTIVE" && directives.has(directiveOf(warning) ?? "");
							const isUnresolvedInScan = manager.isScanBuild && warning.code === "UNRESOLVED_IMPORT";
							const isListedReference = warning.code === "INEFFECTIVE_DYNAMIC_IMPORT" && warning.id !== void 0 && listedOnly.has(warning.id);
							if (isDirective || isUnresolvedInScan || isListedReference) return;
							if (userOnwarn) userOnwarn(warning, warn);
							else warn(warning);
						}
					} },
					environments: Object.fromEntries(runnerLayers().map((name) => [name, layer(name)]))
				};
			}
		},
		configResolved(resolved) {
			if (resolved.command !== "build") return;
			const api = getPluginApi(resolved);
			if (!api) throw new Error("vitest-plugin-rsc: a static build needs Vite RSC's plugin.");
			manager = api.manager;
			base = resolved.base;
			root = resolved.root;
			for (const name of runnerLayers()) {
				const layer = resolved.environments[name]?.build;
				if (!layer) continue;
				layer.write = false;
				layer.rolldownOptions = {
					...layer.rolldownOptions,
					input: inputOf(name)
				};
			}
		},
		async buildApp(builder) {
			const build = (name) => builder.build(environment(builder, name));
			const scanned = [rsc, browser].map((name) => environment(builder, name).config.build);
			const writes = scanned.map((scan) => scan.write);
			built.clear();
			hostModules = /* @__PURE__ */ new Set();
			buildingApp = true;
			try {
				manager.isScanBuild = true;
				for (const scan of scanned) scan.write = false;
				try {
					await build(rsc);
					await build(browser);
				} finally {
					manager.isScanBuild = false;
					scanned.forEach((scan, index) => scan.write = writes[index]);
				}
				await build(rsc);
				for (const name of [browser, ...runnerLayers().filter((name) => name !== browser)]) await build(name);
				const outDir = path.resolve(builder.config.root, environment(builder, rsc).config.build.outDir);
				const write = (fileName, content) => {
					const file = path.join(outDir, fileName);
					fs.mkdirSync(path.dirname(file), { recursive: true });
					fs.writeFileSync(file, content);
				};
				for (const [name, { modules, files }] of built) {
					for (const [fileName, content] of files) write(fileName, content);
					const ids = [...modules.keys()].sort();
					const codes = await Promise.all(ids.map((id) => modules.get(id)));
					write(modulesPath(name), JSON.stringify(Object.fromEntries(ids.map((id, index) => [id, codes[index]]))));
				}
				for (const { pathname, body } of layers.files?.() ?? []) write(pathname, body);
			} finally {
				buildingApp = false;
				parsed.clear();
			}
		},
		buildEnd() {
			if (this.environment.mode !== "build") return;
			const lists = [`\0${clientReferencesId}`, `\0${serverReferencesId}`];
			listedOnly = new Set(lists.flatMap((list) => this.getModuleInfo(list)?.dynamicallyImportedIds ?? []).filter((id) => (this.getModuleInfo(id)?.dynamicImporters ?? []).every((importer) => lists.includes(importer))));
		},
		moduleParsed(info) {
			if (this.environment.mode !== "build") return;
			parsed.set(info.id, info);
		},
		buildStart() {
			if (this.environment.mode !== "build") return;
			parsed.clear();
			if (this.environment.name === rsc && !buildingApp) throw new Error(`vitest-plugin-rsc: the app is built outside the plugin's \`buildApp()\`, which builds its ${countOf(runnerLayers().length + 1)} layers. Vite's \`build()\` does that: it builds one environment. Build with Vite's app builder: \`vite build\`, or \`await (await createBuilder(config, null)).buildApp()\`.`);
		},
		resolveId(source) {
			if (source === "virtual:vitest-plugin-rsc/client-references" || source === serverReferencesId) return `\0${source}`;
			if (source === "virtual:vitest-plugin-rsc/host-modules") return `\0${source}`;
			if (source === layersId) return this.environment.mode === "build" ? `\0${layersId}/built` : `\0${layersId}`;
		},
		load(id) {
			const isBuild = this.environment.mode === "build";
			if (id === `\0virtual:vitest-plugin-rsc/client-references`) {
				if (!isBuild) return "export default undefined;";
				const references = Object.values(manager.clientReferenceMetaMap);
				const { name } = this.environment;
				const listed = name === browser ? void 0 : layers.clientReferences?.[name]?.();
				return referenceList(listed ? references.filter(({ referenceKey }) => listed.has(referenceKey)) : references);
			}
			if (id === `\0${serverReferencesId}`) {
				if (!isBuild) return "export default undefined;";
				return referenceList([...manager.serverReferences.metaMap.values()]);
			}
			if (id === `\0virtual:vitest-plugin-rsc/host-modules`) {
				if (!isBuild || this.environment.name !== rsc) return "export default undefined;";
				return `export default {\n${[...hostModules].sort().map((specifier) => `  ${JSON.stringify(builtHostModuleUrl(specifier))}: () => import(${JSON.stringify(hostModulePrefix + specifier)}),`).join("\n")}\n};\n`;
			}
			if (id === `\0${layersId}`) return "export default undefined;\n";
			if (id === `\0${layersId}/built`) {
				const entries = fetchOrder().map((name) => `  ${JSON.stringify(name)}: { base: directory, entries: ${JSON.stringify(Object.fromEntries(Object.entries(inputOf(name)).map(([input, id]) => [id, `${layersDir}/${name}/${input}.js`])))}, modules: ${JSON.stringify(modulesPath(name))} },`);
				return `const directory = new URL(${buildDirPlaceholder}, import.meta.url).href;\nexport default {\n${entries.join("\n")}\n};\n`;
			}
		},
		transformIndexHtml: {
			order: "post",
			handler(_html, { path: page, chunk, bundle }) {
				if (!chunk || !bundle || !reaches(chunk, `\0${layersId}/built`, bundle)) return;
				return [{
					tag: "link",
					attrs: {
						rel: "preload",
						as: "fetch",
						crossorigin: true,
						href: (base === "./" || base === "" ? toBuildDir(page.slice(1)) : base) + modulesPath(browser)
					},
					injectTo: "head-prepend"
				}];
			}
		},
		outputOptions(output) {
			const chunkFileNames = output.chunkFileNames ?? "[name]-[hash].js";
			return {
				...output,
				chunkFileNames(chunk) {
					const fileName = typeof chunkFileNames === "function" ? chunkFileNames(chunk) : chunkFileNames;
					return chunk.name === path.posix.basename(root) && chunk.moduleIds.some((id) => {
						const file = id.split("?", 1)[0];
						return path.posix.dirname(file) === root && path.posix.parse(file).name === "index";
					}) ? fileName.replaceAll("[name]", "index") : fileName;
				}
			};
		},
		renderChunk(code, chunk) {
			if (!code.includes(buildDirPlaceholder)) return;
			return {
				code: code.replaceAll(buildDirPlaceholder, JSON.stringify(toBuildDir(chunk.fileName))),
				map: null
			};
		},
		generateBundle: {
			order: "post",
			handler(_options, bundle) {
				const { name } = this.environment;
				if (runnerLayers().includes(name)) {
					if (manager.isScanBuild) {
						if (name === browser) hostModules = new Set([...this.getModuleIds()].filter(isHostModule).map(hostModuleSpecifier));
					} else {
						const missing = [...hostModulesOf(bundle)].find((specifier) => !hostModules.has(specifier));
						if (missing !== void 0) this.error(`vitest-plugin-rsc: the ${name} layer imports ${missing} as a module of the page, as \`host.packages\` of vitestPluginNext() names its package, but the scan of the browser layer did not find that import, so the host's build has no instance of it to share. The scan sees every import of the browser layer that its build does: a plugin that adds this import has to add it in the scan too.`);
					}
				}
				if (manager.isScanBuild) return;
				for (const output of Object.values(bundle)) {
					if (output.type !== "asset" || typeof output.source !== "string") continue;
					output.source = output.source.replaceAll(`${cssBuildDirPlaceholder}/`, toBuildDir(output.fileName));
				}
				if (!runnerLayers().includes(name)) return;
				const modules = /* @__PURE__ */ new Map();
				const files = /* @__PURE__ */ new Map();
				for (const output of Object.values(bundle)) if (output.type === "chunk") {
					const rewritten = toRunnerModule(output);
					rewritten.catch(() => {});
					modules.set(`/${output.fileName}`, rewritten);
				} else if (name === browser || !output.fileName.endsWith(".css")) files.set(output.fileName, output.source);
				built.set(name, {
					modules,
					files
				});
			}
		}
	};
}
//#endregion
//#region src/test-file-references.ts
/** The name of Vite RSC's plugin that makes the reference. */
const useClientPlugin = "rsc:use-client";
/** The name of the plugin whose `api` says which modules are Vitest's files. */
const testFilesPlugin = "vitest-plugin-rsc:test-files";
/** The name of the plugin that makes the reference of a test file, last. */
const testFileReferencesPlugin = `${useClientPlugin}:test-files`;
/**
* Vite RSC's plugins, with the transform of `rsc:use-client` in two: of the
* normal order for every other module, and among the plugins that are
* enforced last for the modules of a test file or a setup file, before
* those of vitestPluginNext(): the line it puts in front of the module of
* such a file comes after it (nextjs/client-files.ts).
*/
function referencingTestFilesLast(plugins) {
	if (!plugins.some(({ name }) => name === "rsc:use-client")) throw new Error(`vitest-plugin-rsc: Vite RSC has no plugin \`${useClientPlugin}\` anymore.`);
	const testFiles = /* @__PURE__ */ new WeakMap();
	const isModuleOfTestFile = (context, code, id) => {
		if (!code.includes("use client")) return false;
		const { environment } = context;
		const config = environment.getTopLevelConfig();
		if (!testFiles.has(config)) {
			const plugin = config.plugins.find(({ name }) => name === testFilesPlugin);
			testFiles.set(config, plugin?.api);
		}
		return testFiles.get(config)?.isModuleOfTestFile(id) ?? false;
	};
	return plugins.flatMap((plugin) => {
		if (plugin.name !== "rsc:use-client") return [plugin];
		const hook = typeof plugin.transform === "function" ? { handler: plugin.transform } : plugin.transform;
		if (!hook) throw new Error(`vitest-plugin-rsc: Vite RSC's plugin \`${useClientPlugin}\` has no transform anymore.`);
		const transform = hook.handler;
		return [{
			...plugin,
			transform: {
				...hook,
				handler(code, id) {
					if (isModuleOfTestFile(this, code, id)) return;
					return transform.call(this, code, id);
				}
			}
		}, {
			name: testFileReferencesPlugin,
			enforce: "post",
			transform: {
				...hook,
				order: null,
				handler(code, id) {
					if (!isModuleOfTestFile(this, code, id)) return;
					return transform.call(this, code, id);
				}
			}
		}];
	});
}
//#endregion
export { staticBuild as a, withStaticBuild as c, cssBuildDirPlaceholder as i, createRunnerEnvironmentPlugins as l, testFileReferencesPlugin as n, toBuildDir as o, testFilesPlugin as r, withBuiltFiles as s, referencingTestFilesLast as t };
