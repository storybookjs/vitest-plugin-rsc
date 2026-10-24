import { i as registry } from "./registry-DPyevx_W.js";
import { n as builtFilesPath } from "./styles-shared-CP5LkHjp.js";
import builtLayers from "virtual:vitest-plugin-rsc/layers";
//#region src/nextjs/fast-mode.ts
const caches = () => registry.testFileCaches ??= /* @__PURE__ */ new Set();
/** Whether a feature of fast mode is on in the page. */
function fast(feature) {
	return registry.fast?.[feature] === true;
}
/**
* What `ask` answers for `key`: with `cacheDevServer` the answer of the first
* time in the test file, else a new one. An answer that fails is asked for
* again.
*/
function oncePerTestFile(cache, key, ask) {
	if (!fast("cacheDevServer")) return ask();
	caches().add(cache);
	let answer = cache.get(key);
	if (!answer) {
		answer = ask();
		cache.set(key, answer);
		answer.catch(() => cache.delete(key));
	}
	return answer;
}
/** Forgets the answers of `oncePerTestFile()`, as a test file ends. */
function forgetTestFileAnswers() {
	for (const cache of caches()) cache.clear();
}
const findInterval = 5;
const onEveryChange = Symbol.for("vitest-plugin-rsc:find-on-every-change");
/** With `watchDom`, has `locator` (a Locator of `vitest/browser`) look on every change of the DOM. */
function findOnEveryChange(locator) {
	if (!fast("watchDom")) return;
	let proto = Object.getPrototypeOf(locator);
	while (proto && !Object.prototype.hasOwnProperty.call(proto, "findElement")) proto = Object.getPrototypeOf(proto);
	if (!proto || typeof proto.findElement !== "function" || onEveryChange in proto.findElement) return;
	const vitests = proto.findElement;
	const setTimeout = globalThis.setTimeout;
	const clearTimeout = globalThis.clearTimeout;
	async function find(options = {}) {
		const strict = options.strict ?? true;
		const timeout = options.timeout ?? 6e4;
		const start = performance.now();
		for (;;) {
			const elements = this.elements();
			if (elements.length === 1 || elements.length > 1 && !strict) return elements[0];
			if (elements.length > 1 || performance.now() - start >= timeout) return vitests.call(this, {
				...options,
				timeout: 0
			});
			await new Promise((resolve) => {
				const done = () => {
					observer.disconnect();
					clearTimeout(timer);
					resolve();
				};
				const observer = new MutationObserver(done);
				const timer = setTimeout(done, findInterval);
				observer.observe(document, {
					subtree: true,
					childList: true,
					attributes: true,
					characterData: true
				});
			});
		}
	}
	proto.findElement = Object.assign(find, { [onEveryChange]: true });
}
//#endregion
//#region src/nextjs/built-files.ts
/** The URL of the directory of the build. Nothing with a dev server. */
const buildDirectory = builtLayers && Object.values(builtLayers)[0]?.base;
let built;
/** The files of the build. Only in a build, where `buildDirectory` is. */
function builtFiles() {
	if (!built) {
		built = load(new URL(builtFilesPath, buildDirectory).href);
		built.catch(() => built = void 0);
	}
	return built;
}
async function load(url) {
	const response = await registry.network(url, { cache: "no-cache" });
	if (!response.ok) throw new Error(`vitest-plugin-rsc: ${url} answered ${response.status}: ${await response.text()}`);
	return await response.json();
}
//#endregion
export { forgetTestFileAnswers as a, findOnEveryChange as i, builtFiles as n, oncePerTestFile as o, fast as r, buildDirectory as t };
