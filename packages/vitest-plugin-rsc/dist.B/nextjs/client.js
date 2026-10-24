import { i as registry } from "../registry-DPyevx_W.js";
import { t as recordListeners } from "../leftovers-CqyF3dQx.js";
import { t as registerModuleLoader } from "../client-modules-iQQDUeCs.js";
import { jsx } from "react/jsx-runtime";
import { Fragment, StrictMode, useEffect } from "react";
import ReactDOMClient from "react-dom/client";
import { setNodeOnPage } from "vitest-plugin-rsc/nextjs/node-rendered";
import { unstable_rethrow } from "next/navigation.js";
import { flushSync } from "react-dom";
import { createFromReadableStream } from "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser";
import { appBootstrap } from "next/dist/client/app-bootstrap.js";
import { callServer } from "next/dist/client/app-call-server.js";
import AppRouter from "next/dist/client/components/app-router.js";
import { createMutableActionQueue } from "next/dist/client/components/app-router-instance.js";
import { createInitialRouterState } from "next/dist/client/components/router-reducer/create-initial-router-state.js";
import { invalidateBfCache } from "next/dist/client/components/segment-cache/bfcache.js";
import { invalidateEntirePrefetchCache } from "next/dist/client/components/segment-cache/cache.js";
import { HeadManagerContext } from "next/dist/shared/lib/head-manager-context.shared-runtime";
//#region src/nextjs/compat/browser/client.ts
/** Next's client entry, which reads the Flight payload in the document as it loads. */
const loadAppIndex = () => import("next/dist/client/app-index.js");
//#endregion
//#region src/nextjs/client.tsx
let current;
function report(error) {
	if (!current) return;
	current.nodeOnPage?.errored(error);
	if (!current.signal.aborted && !isNextControlFlow(error)) current.errors.push(error);
}
function reportingErrors(options, report) {
	const { onCaughtError, onUncaughtError } = options ?? {};
	if (!options || !onCaughtError || !onUncaughtError) return options;
	return {
		...options,
		onCaughtError(error, info) {
			report(error);
			onCaughtError(error, info);
		},
		onUncaughtError(error, info) {
			report(error);
			onUncaughtError(error, info);
		}
	};
}
function isNextControlFlow(error) {
	try {
		unstable_rethrow(error);
		return false;
	} catch (thrown) {
		return thrown === error;
	}
}
/**
* Hydrates the document, or with a `container`, the node of a test in it.
* Resolves once it has, with how to leave the page. Calls `loaded` once Next's
* client has loaded, before a module of the app has. A page of a node tells
* `nodeOnPage` what it does with the node: see node-rendered.tsx. The errors
* that React reports on the root of the app go in `errors`, in order, but
* for those of Next's control flow.
*
* Rejects once `signal` aborts, when the page is left before it has hydrated.
* What it started is gone by then: the root, and the listeners React added.
* A root that Next would create after that renders nothing.
*/
async function start(loaded, container, signal, nodeOnPage, errors, keep = false) {
	setNodeOnPage(nodeOnPage);
	const page = {
		signal,
		errors,
		nodeOnPage,
		leaving: false
	};
	current = page;
	let nextLoaded;
	const forgetLoader = registerModuleLoader("browser", new Promise((resolve) => nextLoaded = resolve));
	globalThis.__viteRscCallServer = callServer;
	let root;
	const listeners = [];
	const { hydrateRoot, createRoot } = ReactDOMClient;
	const keepRoot = (target, create) => {
		if (signal.aborted) return {
			render() {},
			unmount() {}
		};
		const isApp = target === document;
		const to = isApp && container ? container : target;
		const added = (isApp && container ? [document, container] : [document]).map((of) => recordListeners(of));
		listeners.push(...added);
		try {
			const created = create(to, isApp);
			if (isApp) root = created;
			return created;
		} finally {
			for (const recorded of added) recorded.stop();
		}
	};
	ReactDOMClient.hydrateRoot = (target, children, options) => keepRoot(target, (to, isApp) => hydrateRoot(to, children, {
		...isApp ? reportingErrors(options, report) : options,
		onRecoverableError(error, info) {
			if (current?.leaving) return;
			if (options?.onRecoverableError) options.onRecoverableError(error, info);
			else reportError(error);
		}
	}));
	ReactDOMClient.createRoot = (target, options) => keepRoot(target, (to, isApp) => createRoot(to, isApp ? reportingErrors(options, report) : options));
	const leave = () => {
		page.leaving = true;
		forgetLoader();
		root?.unmount();
		for (const added of listeners) added.remove();
	};
	try {
		const { hydrate } = await loadAppIndex();
		loaded();
		nextLoaded();
		signal.throwIfAborted();
		const bootstrapScript = document.querySelector("script[src*='/_next/']");
		if (!bootstrapScript) throw new Error("vitest-plugin-rsc: the response is not a page of the Next.js app");
		Object.defineProperty(document, "currentScript", {
			configurable: true,
			value: bootstrapScript
		});
		try {
			await new Promise((resolve, reject) => {
				const abort = () => reject(signal.reason);
				signal.addEventListener("abort", abort, { once: true });
				globalThis.__NEXT_HYDRATED_CB = () => {
					signal.removeEventListener("abort", abort);
					resolve();
				};
				appBootstrap((assetPrefix) => {
					hydrate([], assetPrefix).catch(reject);
				});
			});
		} finally {
			delete document.currentScript;
			delete globalThis.__NEXT_HYDRATED_CB;
		}
	} catch (error) {
		leave();
		throw error;
	} finally {
		if (!signal.aborted) {
			ReactDOMClient.hydrateRoot = hydrateRoot;
			ReactDOMClient.createRoot = createRoot;
		}
	}
	if (!root) throw new Error("vitest-plugin-rsc: Next.js did not create a React root on the document, which the plugin needs to leave the page.");
	if (!keep) return {
		unmount: leave,
		leaveApp: leave
	};
	app = {
		root,
		renders: 0
	};
	return {
		unmount: () => leavePage(page, forgetLoader),
		leaveApp() {
			app = void 0;
			leave();
		}
	};
}
let app;
function leavePage(page, forgetLoader) {
	page.leaving = true;
	forgetLoader();
	flushSync(() => app?.root.render(null));
}
function documentPayload() {
	const segments = self.__next_f ?? [];
	const encoder = new TextEncoder();
	return new ReadableStream({ start(controller) {
		for (const [kind, data = ""] of segments) if (kind === 1) controller.enqueue(encoder.encode(data));
		else if (kind === 3) controller.enqueue(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
		controller.close();
	} });
}
function Committed({ onCommit, children }) {
	useEffect(onCommit, [onCommit]);
	return children;
}
/**
* Renders the page in the document into the root of the app that `start()`
* kept, in place of the page before it: what Next's entry does as the page
* loads, without the entry, from the Flight payload in the document. The
* modules of the app stay, and so does its root, so this is no page load:
* its Flight payload is decoded, the router gets a state of its own from it,
* and a tree with a key of its own mounts.
* Resolves as `start()` does, once it has rendered.
*
* What the modules of the app keep stays from the page before: Next's caches
* of its router are emptied, but the state of a module of the app, or of a
* package, is still there.
*/
async function renderAgain(signal, errors) {
	const kept = app;
	if (!kept) throw new Error("vitest-plugin-rsc: there is no kept app to render the page in.");
	setNodeOnPage(void 0);
	const page = {
		signal,
		errors,
		nodeOnPage: void 0,
		leaving: false
	};
	current = page;
	const forgetLoader = registerModuleLoader("browser");
	globalThis.__viteRscCallServer = callServer;
	invalidateEntirePrefetchCache(null, null);
	invalidateBfCache();
	try {
		const payload = await createFromReadableStream(documentPayload(), { callServer });
		signal.throwIfAborted();
		registry.replacingRouter = true;
		let actionQueue;
		try {
			actionQueue = createMutableActionQueue(createInitialRouterState({
				navigatedAt: Date.now(),
				initialRSCPayload: payload,
				initialFlightStreamForCache: null,
				location: window.location
			}));
		} finally {
			registry.replacingRouter = false;
		}
		const Strict = process.env.__NEXT_STRICT_MODE_APP ? StrictMode : Fragment;
		await new Promise((resolve, reject) => {
			const abort = () => reject(signal.reason);
			signal.addEventListener("abort", abort, { once: true });
			const committed = () => {
				signal.removeEventListener("abort", abort);
				resolve();
			};
			kept.root.render(/* @__PURE__ */ jsx(Strict, { children: /* @__PURE__ */ jsx(HeadManagerContext.Provider, {
				value: { appDir: true },
				children: /* @__PURE__ */ jsx(Committed, {
					onCommit: committed,
					children: /* @__PURE__ */ jsx(AppRouter, {
						actionQueue,
						globalErrorState: payload.G
					}, ++kept.renders)
				})
			}) }));
		});
	} catch (error) {
		leavePage(page, forgetLoader);
		throw error;
	}
	return {
		unmount: () => leavePage(page, forgetLoader),
		leaveApp() {
			app = void 0;
		}
	};
}
//#endregion
export { renderAgain, start };
