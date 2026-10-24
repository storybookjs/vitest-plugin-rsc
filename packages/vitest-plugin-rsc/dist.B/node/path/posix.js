import path from "vitest-plugin-rsc/node/path";
//#region src/node/path/posix.ts
const missing = (name) => function() {
	throw new Error(`vitest-plugin-rsc: ${name} of Node.js is not there in the browser`);
};
const own = path.posix;
const basename = own.basename ?? missing("path/posix.basename");
const dirname = own.dirname ?? missing("path/posix.dirname");
const extname = own.extname ?? missing("path/posix.extname");
const format = own.format ?? missing("path/posix.format");
const isAbsolute = own.isAbsolute ?? missing("path/posix.isAbsolute");
const join = own.join ?? missing("path/posix.join");
const normalize = own.normalize ?? missing("path/posix.normalize");
const parse = own.parse ?? missing("path/posix.parse");
const relative = own.relative ?? missing("path/posix.relative");
const resolve = own.resolve ?? missing("path/posix.resolve");
const toNamespacedPath = own.toNamespacedPath ?? missing("path/posix.toNamespacedPath");
const sep = own.sep ?? missing("path/posix.sep");
const delimiter = own.delimiter ?? missing("path/posix.delimiter");
const posix = own.posix ?? missing("path/posix.posix");
const win32 = own.win32 ?? missing("path/posix.win32");
const _makeLong = own._makeLong ?? missing("path/posix._makeLong");
const matchesGlob = own.matchesGlob ?? missing("path/posix.matchesGlob");
//#endregion
export { _makeLong, basename, own as default, delimiter, dirname, extname, format, isAbsolute, join, matchesGlob, normalize, parse, posix, relative, resolve, sep, toNamespacedPath, win32 };
