import { jsx } from "react/jsx-runtime";
import * as React from "react";
import * as ReactDOMClient$1 from "react-dom/client";
import * as ReactClient from "@vitejs/plugin-rsc/react/browser";
import clientReferences from "virtual:vitest-plugin-rsc/client-references";
//#region src/testing-library-client.tsx
async function createTestingLibraryClientRoot(options) {
	let setPayload;
	const initialPayload = await ReactClient.createFromReadableStream(await options.fetchRsc());
	function BrowserRoot() {
		const [payload, setPayload_] = React.useState(initialPayload);
		React.useEffect(() => {
			setPayload = (v) => React.startTransition(() => setPayload_(v));
		}, [setPayload_]);
		return payload.root;
	}
	ReactClient.setServerCallback(async (id, args) => {
		const temporaryReferences = ReactClient.createTemporaryReferenceSet();
		const reply = await ReactClient.encodeReply(args, { temporaryReferences });
		const payload = await ReactClient.createFromReadableStream(await options.fetchRsc({
			id,
			reply
		}), { temporaryReferences });
		setPayload(payload);
		return payload.returnValue;
	});
	let browserRoot = /* @__PURE__ */ jsx(BrowserRoot, {});
	if (options.config.reactStrictMode) browserRoot = /* @__PURE__ */ jsx(React.StrictMode, { children: browserRoot });
	const reactRoot = ReactDOMClient$1.createRoot(options.container, options.config.rootOptions);
	reactRoot.render(browserRoot);
	async function rerender() {
		const payload = await ReactClient.createFromReadableStream(await options.fetchRsc());
		setPayload(payload);
	}
	function unmount() {
		reactRoot.unmount();
	}
	return {
		rerender: () => act(() => rerender()),
		unmount: () => act(() => unmount())
	};
}
async function act(callback) {
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	try {
		await React.act(callback);
	} finally {
		globalThis.IS_REACT_ACT_ENVIRONMENT = false;
	}
}
function initialize() {
	ReactClient.setRequireModule({ load: (id) => {
		if (!clientReferences) return import(
			/* @vite-ignore */
			id
);
		const load = clientReferences[id];
		if (!load) return Promise.reject(/* @__PURE__ */ new Error(`vitest-plugin-rsc: the build has no Client Component "${id}"`));
		return load();
	} });
}
//#endregion
export { createTestingLibraryClientRoot, initialize };
