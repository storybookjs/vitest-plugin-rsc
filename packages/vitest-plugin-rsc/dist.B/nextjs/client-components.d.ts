import { r as loadClientModule, t as linkStylesheetsOf } from "../client-graph-jie3vKRX.js";

//#region src/nextjs/host-document.d.ts
/**
 * Keeps the host's document while the host renders components outside a
 * browser context of the app: a link or a form that would load another
 * document is stopped, and `report` hears of it with the URL it would load.
 * By default `reportError()` gets an error that says why. A declared
 * download, like `<a download>`, is the browser's, and while a context is
 * open, the app has the navigations. Until the function it returns is
 * called.
 */
declare function keepHostDocument(report?: (url: URL) => void): () => void;
//#endregion
export { keepHostDocument, linkStylesheetsOf, loadClientModule };