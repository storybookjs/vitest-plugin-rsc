import path from "vitest-plugin-rsc/node/path";
//#region src/node/path/win32.ts
const missing = (name) => function() {
	throw new Error(`vitest-plugin-rsc: ${name} of Node.js is not there in the browser`);
};
const own = path.win32;
const basename = own.basename ?? missing("path/win32.basename");
const dirname = own.dirname ?? missing("path/win32.dirname");
const extname = own.extname ?? missing("path/win32.extname");
const format = own.format ?? missing("path/win32.format");
const isAbsolute = own.isAbsolute ?? missing("path/win32.isAbsolute");
const join = own.join ?? missing("path/win32.join");
const normalize = own.normalize ?? missing("path/win32.normalize");
const parse = own.parse ?? missing("path/win32.parse");
const relative = own.relative ?? missing("path/win32.relative");
const resolve = own.resolve ?? missing("path/win32.resolve");
const toNamespacedPath = own.toNamespacedPath ?? missing("path/win32.toNamespacedPath");
const sep = own.sep ?? missing("path/win32.sep");
const delimiter = own.delimiter ?? missing("path/win32.delimiter");
const posix = own.posix ?? missing("path/win32.posix");
const win32 = own.win32 ?? missing("path/win32.win32");
const _makeLong = own._makeLong ?? missing("path/win32._makeLong");
const matchesGlob = own.matchesGlob ?? missing("path/win32.matchesGlob");
//#endregion
export { _makeLong, basename, own as default, delimiter, dirname, extname, format, isAbsolute, join, matchesGlob, normalize, parse, posix, relative, resolve, sep, toNamespacedPath, win32 };
