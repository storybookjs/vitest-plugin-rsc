import { a as staticBuild, l as createRunnerEnvironmentPlugins, t as referencingTestFilesLast } from "./test-file-references-BNM34gwD.js";
import { a as versionEvent, n as answerPage, r as changedEvent, t as answerEvent } from "./websocket-bridge-20VEq6PG.js";
import { createRequire } from "node:module";
import { parseAstAsync } from "vite";
import { vitePluginRscMinimal } from "@vitejs/plugin-rsc/plugin";
import { GenMapping, addMapping, setSourceContent, toEncodedMap } from "@jridgewell/gen-mapping";
import { ssrDynamicImportKey, ssrExportAllKey, ssrExportNameKey, ssrImportKey, ssrImportMetaKey, ssrModuleExportsKey } from "vite/module-runner";
import * as convertSourceMap from "convert-source-map";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
//#region src/coverage.ts
const reactClientCoverageModulePath = "/@vite/react-client-coverage-module";
const reactClientCoverageQuery = "vitest-plugin-rsc-react-client-coverage";
const moduleRunnerArgumentNames = [
	ssrModuleExportsKey,
	ssrImportMetaKey,
	ssrImportKey,
	ssrDynamicImportKey,
	ssrExportAllKey,
	ssrExportNameKey
];
function createReactClientCoveragePlugin() {
	const modules = /* @__PURE__ */ new Map();
	return {
		name: "rsc:react-client-coverage",
		enforce: "pre",
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				if (new URL(req.url ?? "/", "https://any.local").pathname !== reactClientCoverageModulePath) {
					next();
					return;
				}
				const coverageModule = await readCoverageModule(req);
				const id = normalizeCoverageFileId(coverageModule.file);
				const code = wrapModuleRunnerCode(coverageModule.code);
				const sourceMap = extractInlineSourceMap(coverageModule.code);
				modules.set(id, {
					code,
					map: hasMappings(sourceMap) ? sourceMap : createIdentitySourceMap(id, code)
				});
				invalidateClientModules(server, id);
				res.statusCode = 204;
				res.end();
			});
		},
		load(id) {
			if (this.environment.name !== "client") return;
			if (!isReactClientCoverageId(id)) return;
			return modules.get(normalizeCoverageFileId(id));
		}
	};
}
function isReactClientCoverageId(id) {
	const query = id.split("?", 2)[1];
	return query !== void 0 && new URLSearchParams(query).has(reactClientCoverageQuery);
}
async function readCoverageModule(req) {
	const decoder = new TextDecoder();
	let json = "";
	for await (const chunk of req) json += decoder.decode(chunk, { stream: true });
	json += decoder.decode();
	const body = JSON.parse(json);
	if (typeof body.file !== "string" || typeof body.code !== "string") throw new TypeError("Invalid react client coverage module payload.");
	return body;
}
function extractInlineSourceMap(code) {
	return convertSourceMap.fromSource(code)?.toObject();
}
function hasMappings(map) {
	return typeof map === "object" && map !== null && "mappings" in map && typeof map.mappings === "string" && map.mappings.length > 0;
}
function createIdentitySourceMap(file, code) {
	const source = `file://${file}`;
	const map = new GenMapping();
	setSourceContent(map, source, code);
	for (let line = 1; line <= code.split("\n").length; line++) addMapping(map, {
		generated: {
			line,
			column: 0
		},
		source,
		original: {
			line,
			column: 0
		}
	});
	return toEncodedMap(map);
}
function wrapModuleRunnerCode(code) {
	const AsyncFunction = async function() {}.constructor;
	return new AsyncFunction(...moduleRunnerArgumentNames, `"use strict";${code}`).toString();
}
function normalizeCoverageFileId(id) {
	const cleanId = id.split(/[?#]/, 1)[0];
	let pathname = cleanId;
	if (cleanId.startsWith("file://")) return fileUrlToPath(cleanId);
	if (cleanId.startsWith("http://") || cleanId.startsWith("https://")) pathname = decodeURIComponent(new URL(cleanId).pathname);
	if (pathname.startsWith("/@fs/")) return pathname.slice(4);
	return pathname;
}
function fileUrlToPath(id) {
	const url = new URL(id);
	const pathname = decodeURIComponent(url.pathname);
	if (url.hostname) return `//${url.hostname}${pathname}`;
	return pathname.replace(/^\/([A-Za-z]:)/, "$1");
}
function invalidateClientModules(server, file) {
	const modules = server.environments.client.moduleGraph.getModulesByFile(file) ?? [];
	for (const moduleNode of modules) server.environments.client.moduleGraph.invalidateModule(moduleNode);
}
//#endregion
//#region src/dependency-transforms.ts
function dependencyTransformPlugin() {
	return {
		name: "rsc:dependency-transforms",
		async configureServer(server) {
			const transform = await rolldownTransform();
			if (!transform) return;
			for (const environment of Object.values(server.environments)) {
				const { consumer, dev } = environment.config;
				if (consumer === "client" && dev.moduleRunnerTransform) transformDependencies(environment, transform);
			}
		}
	};
}
async function rolldownTransform() {
	try {
		const vite = createRequire(import.meta.url).resolve("vite/package.json");
		const experimental = createRequire(vite).resolve("rolldown/experimental");
		const { moduleRunnerTransform } = await import(pathToFileURL(experimental).href);
		if (typeof moduleRunnerTransform === "function") return moduleRunnerTransform;
	} catch {}
}
function transformDependencies(environment, transform) {
	const { moduleGraph, pluginContainer } = environment;
	const transforming = /* @__PURE__ */ new Map();
	async function prepare(url) {
		const optimizer = environment.depsOptimizer;
		if (!optimizer || environment._closing) return;
		const entry = await moduleGraph.ensureEntryFromUrl(url);
		if (!entry.id || !optimizer.isOptimizedDepFile(entry.id)) return;
		let pending = transforming.get(entry);
		if (!pending) {
			pending = transformInto(entry, entry.id).finally(() => transforming.delete(entry));
			transforming.set(entry, pending);
		}
		await pending;
	}
	async function transformInto(entry, id) {
		const stateOf = () => entry.invalidationState;
		if (entry.transformResult || typeof stateOf() === "object") return;
		const state = stateOf();
		const invalidated = entry.lastInvalidationTimestamp;
		const loaded = await pluginContainer.load(id);
		if (loaded == null) return;
		const source = typeof loaded === "string" ? {
			code: loaded,
			map: null
		} : loaded;
		const { code } = await pluginContainer.transform(source.code, id, { inMap: source.map });
		const result = await transform(entry.file ?? id, code);
		if (result.errors.length > 0 || entry.transformResult || stateOf() !== state) return;
		if (entry.lastInvalidationTimestamp !== invalidated) return;
		const at = (dep) => {
			const index = result.code.indexOf(`__vite_ssr_import__(${JSON.stringify(dep)}`);
			return index === -1 ? Infinity : index;
		};
		moduleGraph.updateModuleTransformResult(entry, {
			code: result.code,
			map: null,
			ssr: true,
			deps: result.deps.toSorted((a, b) => at(a) - at(b)),
			dynamicDeps: result.dynamicDeps
		});
	}
	const { transformRequest, warmupRequest } = environment;
	environment.transformRequest = async function(url, ...rest) {
		await prepare(url).catch(() => {});
		return transformRequest.call(this, url, ...rest);
	};
	environment.warmupRequest = async function(url) {
		await prepare(url).catch(() => {});
		return warmupRequest.call(this, url);
	};
}
//#endregion
//#region src/module-versions.ts
const invalidatedAt = (node) => Math.max(node.lastInvalidationTimestamp, node.lastHMRTimestamp);
/** When Vite last invalidated a module of the graph, or 0. */
function versionOf(graph) {
	let version = 0;
	for (const node of graph?.idToModuleMap.values() ?? []) version = Math.max(version, invalidatedAt(node));
	return version;
}
/** The ids of the modules of the graph that Vite invalidated after `version`. */
function changedAfter(graph, version) {
	const changed = [];
	for (const [id, node] of graph?.idToModuleMap ?? []) if (invalidatedAt(node) > version) changed.push(id);
	return changed;
}
//#endregion
//#region src/vite-client.ts
/** The page's own instance of Vite's client. */
const pageViteClientId = "virtual:vitest-plugin-rsc/vite-client";
/** Where the page keeps it for its module runners, see utils.ts. */
const pageViteClientGlobal = "globalThis.__vitest_plugin_rsc_vite_client__";
function pageViteClientPlugin() {
	let clientFile;
	return {
		name: "rsc:page-vite-client",
		enforce: "pre",
		resolveId(source) {
			if (source === pageViteClientId) return `\0${pageViteClientId}`;
		},
		async load(id) {
			if (id === `\0${pageViteClientId}`) {
				if (this.environment.mode !== "dev") return "export {};";
				const url = path.posix.join(this.environment.config.base, "/@vite/client");
				return `export * from ${JSON.stringify(url)};`;
			}
			const { consumer, dev } = this.environment.config;
			if (this.environment.mode !== "dev") return;
			if (consumer !== "client" || !dev.moduleRunnerTransform) return;
			clientFile ??= (await this.resolve("/@vite/client"))?.id;
			if (id !== clientFile) return;
			const names = (await parseAstAsync(fs.readFileSync(id, "utf8"))).body.flatMap((node) => node.type === "ExportNamedDeclaration" ? node.specifiers.map(({ exported }) => exported.name) : []);
			if (names.length === 0) throw new Error(`Found no exports in Vite's client, ${id}.`);
			return `const client = ${pageViteClientGlobal};\nif (!client) throw new Error("vitest-plugin-rsc: the page has no Vite client to share.");\n` + names.map((name) => `export const ${name} = client.${name};`).join("\n");
		}
	};
}
//#endregion
//#region src/index.ts
const vendoredFlight = (entry) => `vitest-plugin-rsc > @vitejs/plugin-rsc/vendor/react-server-dom/${entry}`;
function withConfiguredSourceConditions(config, conditions) {
	const sourceConditions = (config.resolve?.conditions ?? []).filter((condition) => condition === "vitest-plugin-rsc-source");
	return [.../* @__PURE__ */ new Set([...sourceConditions, ...conditions])];
}
const encryptionKey = JSON.stringify("dml0ZXN0LXBsdWdpbi1yc2MtZW5jcnlwdGlvbi1rZXk=");
function vitestPluginRSC() {
	return [
		pageViteClientPlugin(),
		...referencingTestFilesLast(vitePluginRscMinimal({
			environment: {
				browser: "react_client",
				rsc: "client"
			},
			defineEncryptionKey: encryptionKey
		})),
		staticBuild({
			rsc: "client",
			browser: "react_client",
			layers: { entries: { react_client: "vitest-plugin-rsc/testing-library-client" } }
		}),
		{
			name: "rsc:run-in-browser",
			configureServer(server) {
				answerPage(server, changedEvent, ({ environment, since }) => changedAfter(server.environments[environment]?.moduleGraph, since));
				server.ws.on("connection", (socket, req) => {
					if (new URL(req.url ?? "/", "https://any.local").searchParams.get("vitest-plugin-rsc-react-client") !== "1") return;
					socket.on("message", async (raw) => {
						const invoke = parseWebSocketInvoke(raw);
						if (!invoke) return;
						const environment = server.environments[invoke.environment];
						const result = !invoke.payload ? versionOf(environment?.moduleGraph) : environment && invoke.environment !== "client" ? describeModule(environment, await environment.hot.handleInvoke(invoke.payload)) : { error: { message: `No environment "${invoke.environment}" to run in the page` } };
						socket.send(JSON.stringify({
							type: "custom",
							event: answerEvent,
							data: {
								id: invoke.id,
								result
							}
						}));
					});
				});
				server.middlewares.use((req, res, next) => {
					if (new URL(req.url ?? "/", "https://any.local").pathname === "/@vite/react-client-runner-websocket") {
						res.setHeader("Content-Type", "application/json");
						res.end(JSON.stringify(getReactClientWebSocketInfo(server)));
						return;
					}
					next();
				});
			},
			config(config) {
				return {
					resolve: { alias: {
						"node:async_hooks": "vitest-plugin-rsc/async-hooks",
						async_hooks: "vitest-plugin-rsc/async-hooks"
					} },
					environments: {
						client: {
							keepProcessEnv: false,
							dev: { preTransformRequests: false },
							resolve: { conditions: withConfiguredSourceConditions(config, ["browser", "react-server"]) },
							optimizeDeps: {
								include: [
									"react",
									"react-dom",
									"react-dom/client",
									"react/jsx-runtime",
									"react/jsx-dev-runtime",
									vendoredFlight("server.edge"),
									vendoredFlight("client.edge")
								],
								exclude: [
									"vite",
									"vitest-plugin-rsc",
									"@vitejs/plugin-rsc"
								]
							}
						},
						react_client: {
							consumer: "client",
							keepProcessEnv: false,
							resolve: {
								conditions: withConfiguredSourceConditions(config, ["browser"]),
								dedupe: ["react", "react-dom"]
							},
							dev: {
								moduleRunnerTransform: true,
								preTransformRequests: true
							},
							optimizeDeps: {
								include: [
									"react",
									"react-dom",
									"react-dom/client",
									"react/jsx-runtime",
									"react/jsx-dev-runtime",
									vendoredFlight("client.browser")
								],
								exclude: ["vitest-plugin-rsc", "@vitejs/plugin-rsc"]
							}
						}
					}
				};
			}
		},
		dependencySourceMapPlugin(),
		dependencyTransformPlugin(),
		createReactClientCoveragePlugin(),
		...createRunnerEnvironmentPlugins("react_client")
	];
}
function describeModule(environment, result) {
	const fetched = result.result;
	if (typeof fetched?.id !== "string" || typeof fetched.code !== "string") return result;
	const imports = environment.moduleGraph.getModuleById(fetched.id)?.transformResult?.deps;
	return {
		...result,
		imports,
		dependency: isDependency(environment, fetched.id)
	};
}
function isDependency(environment, id) {
	return id.includes("/node_modules/") || !!environment.depsOptimizer?.isOptimizedDepFile(id);
}
function dependencySourceMapPlugin() {
	return {
		name: "rsc:dependency-source-map",
		enforce: "pre",
		transform(code, id) {
			const { environment } = this;
			const { consumer, dev } = environment.config;
			if (environment.mode !== "dev" || consumer !== "client" || !dev.moduleRunnerTransform) return;
			if (!isDependency(environment, id)) return;
			return {
				code: `${code}\n`,
				map: { mappings: "" }
			};
		}
	};
}
function parseWebSocketInvoke(raw) {
	try {
		const message = JSON.parse(String(raw));
		const isVersion = message.event === versionEvent;
		if (message.type !== "custom" || message.event !== "vitest-plugin-rsc:react-client:invoke" && !isVersion || typeof message.data?.id !== "string" || !message.data.payload && !isVersion) return;
		return {
			id: message.data.id,
			environment: typeof message.data.environment === "string" ? message.data.environment : "react_client",
			payload: isVersion ? void 0 : message.data.payload
		};
	} catch {
		return;
	}
}
function getReactClientWebSocketInfo(server) {
	return {
		token: server.config.webSocketToken,
		path: server.config.base
	};
}
//#endregion
export { vitestPluginRSC };
