import { i as registry } from "../registry-DPyevx_W.js";
import { n as forgetClientFiles, o as loadedAsClientFile, r as linkStylesheetsOf } from "../client-graph-BklcDKcx.js";
import { a as forgetTestFileAnswers, i as findOnEveryChange } from "../built-files-CUO9Cl8u.js";
import { o as leaveKeptAppWithPage, r as newBrowserContext, s as ssrLayer, t as cleanup } from "../nextjs-i_Fr6BQC.js";
import { n as keepHostDocument, r as noRouter } from "../host-document-DMFzTCG8.js";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { page, server } from "vitest/browser";
import "virtual:vitest-plugin-rsc/next-fast-crypto";
//#region src/nextjs/setup.ts
forgetClientFiles();
let nodeFiles = [...server.config.setupFiles];
registry.nodeFiles = () => nodeFiles;
let clientFile = false;
let keptDocument;
beforeAll(async ({}, suite) => {
	nodeFiles = [...server.config.setupFiles, suite.file.filepath];
	clientFile = loadedAsClientFile(suite.file.filepath);
	if (clientFile) keptDocument = keepHostDocument((url) => reportError(noRouter(url)));
	await linkStylesheetsOf(nodeFiles);
});
afterAll(async () => {
	try {
		await leaveKeptAppWithPage("the end of the test file");
	} finally {
		keptDocument?.();
		forgetTestFileAnswers();
	}
});
await ssrLayer();
afterEach(() => cleanup());
beforeEach(async () => {
	await (clientFile ? cleanup() : newBrowserContext());
	await linkStylesheetsOf(nodeFiles);
});
findOnEveryChange(page.getByText(""));
//#endregion
export {};
