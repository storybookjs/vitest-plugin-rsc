import { r as pageReset } from "./async-local-storage-B5kOHq_J.js";
import { a as importReactClient } from "./utils-CNQf4hUJ.js";
import * as ReactServer from "@vitejs/plugin-rsc/react/rsc";
import serverReferences from "virtual:vitest-plugin-rsc/server-references";
import { jsx } from "react/jsx-runtime";
//#region src/testing-library.tsx
const client = await importReactClient("vitest-plugin-rsc/testing-library-client");
const mountedContainers = /* @__PURE__ */ new Set();
const mountedRootEntries = [];
async function renderServer(ui, { container, baseElement = document.body, wrapper: WrapperComponent } = {}) {
	container ??= baseElement.appendChild(document.createElement("div"));
	let root;
	if (!mountedContainers.has(container)) {
		const fetchRsc = async (actionRequest) => {
			let returnValue;
			let temporaryReferences;
			if (actionRequest) {
				const { id, reply } = actionRequest;
				temporaryReferences = ReactServer.createTemporaryReferenceSet();
				const args = await ReactServer.decodeReply(reply, { temporaryReferences });
				returnValue = await (await ReactServer.loadServerAction(id)).apply(null, args);
			}
			let serverRoot = ui;
			if (WrapperComponent) serverRoot = /* @__PURE__ */ jsx(WrapperComponent, { children: ui });
			const rscPayload = {
				root: serverRoot,
				returnValue
			};
			const rscOptions = { temporaryReferences };
			return ReactServer.renderToReadableStream(rscPayload, rscOptions);
		};
		root = await client.createTestingLibraryClientRoot({
			container,
			config,
			fetchRsc
		});
		mountedRootEntries.push({
			container,
			root
		});
		mountedContainers.add(container);
	} else root = mountedRootEntries.find((it) => it.container === container).root;
	return {
		container,
		baseElement,
		unmount: () => unmountRoot(container, false),
		rerender: async (newUi) => {
			ui = newUi;
			await root.rerender();
		},
		asFragment: () => {
			return document.createRange().createContextualFragment(container.innerHTML);
		}
	};
}
async function unmountRoot(container, removeContainer) {
	const index = mountedRootEntries.findIndex((it) => it.container === container);
	if (index === -1) return;
	const entry = mountedRootEntries.splice(index, 1)[0];
	if (!entry) return;
	mountedContainers.delete(container);
	await entry.root.unmount();
	if (removeContainer && container.parentNode === document.body) document.body.removeChild(container);
}
async function cleanup() {
	try {
		const rootEntries = Array.from(mountedRootEntries);
		for (const { container } of rootEntries) await unmountRoot(container, true);
	} finally {
		mountedRootEntries.length = 0;
		mountedContainers.clear();
		pageReset();
	}
}
const config = {
	reactStrictMode: false,
	rootOptions: {}
};
function initialize(customConfig = {}) {
	Object.assign(config, customConfig);
	ReactServer.setRequireModule({ load: (id) => {
		if (!serverReferences) return __vite_rsc_raw_import__(id);
		const load = serverReferences[id];
		if (!load) return Promise.reject(/* @__PURE__ */ new Error(`vitest-plugin-rsc: the build has no Server Action module "${id}"`));
		return load();
	} });
	client.initialize();
}
//#endregion
export { cleanup, initialize, renderServer };
