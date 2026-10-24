import promises from "node:dns/promises";
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {}, { __unenv__: true });
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
/* @__NO_SIDE_EFFECTS__ */
function createNotImplementedError(name) {
	return /* @__PURE__ */ new Error(`[unenv] ${name} is not implemented yet!`);
}
/* @__NO_SIDE_EFFECTS__ */
function notImplemented(name) {
	const fn = () => {
		throw /* @__PURE__ */ createNotImplementedError(name);
	};
	return Object.assign(fn, { __unenv__: true });
}
/* @__NO_SIDE_EFFECTS__ */
function notImplementedAsync(name) {
	const fn = /* @__PURE__ */ notImplemented(name);
	fn.__promisify__ = () => /* @__PURE__ */ notImplemented(name + ".__promisify__");
	fn.native = fn;
	return fn;
}
/* @__NO_SIDE_EFFECTS__ */
function notImplementedClass(name) {
	return class {
		__unenv__ = true;
		constructor() {
			throw new Error(`[unenv] ${name} is not implemented yet!`);
		}
	};
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/dns/constants.mjs
const ADDRCONFIG = 1024;
const ALL = 256;
const V4MAPPED = 2048;
const NODATA = "ENODATA";
const FORMERR = "EFORMERR";
const SERVFAIL = "ESERVFAIL";
const NOTFOUND = "ENOTFOUND";
const NOTIMP = "ENOTIMP";
const REFUSED = "EREFUSED";
const BADQUERY = "EBADQUERY";
const BADNAME = "EBADNAME";
const BADFAMILY = "EBADFAMILY";
const BADRESP = "EBADRESP";
const CONNREFUSED = "ECONNREFUSED";
const TIMEOUT = "ETIMEOUT";
const EOF = "EOF";
const FILE = "EFILE";
const NOMEM = "ENOMEM";
const DESTRUCTION = "EDESTRUCTION";
const BADSTR = "EBADSTR";
const BADFLAGS = "EBADFLAGS";
const NONAME = "ENONAME";
const BADHINTS = "EBADHINTS";
const NOTINITIALIZED = "ENOTINITIALIZED";
const LOADIPHLPAPI = "ELOADIPHLPAPI";
const ADDRGETNETWORKPARAMS = "EADDRGETNETWORKPARAMS";
const CANCELLED = "ECANCELLED";
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/dns.mjs
const Resolver = /* @__PURE__ */ notImplementedClass("dns.Resolver");
const getDefaultResultOrder = () => "verbatim";
const getServers = () => [];
const lookup = /* @__PURE__ */ notImplementedAsync("dns.lookup");
const lookupService = /* @__PURE__ */ notImplementedAsync("dns.lookupService");
const resolve = /* @__PURE__ */ notImplementedAsync("dns.resolve");
const resolve4 = /* @__PURE__ */ notImplementedAsync("dns.resolve4");
const resolve6 = /* @__PURE__ */ notImplementedAsync("dns.resolve6");
const resolveAny = /* @__PURE__ */ notImplementedAsync("dns.resolveAny");
const resolveCaa = /* @__PURE__ */ notImplementedAsync("dns.resolveCaa");
const resolveCname = /* @__PURE__ */ notImplementedAsync("dns.resolveCname");
const resolveMx = /* @__PURE__ */ notImplementedAsync("dns.resolveMx");
const resolveNaptr = /* @__PURE__ */ notImplementedAsync("dns.resolveNaptr");
const resolveNs = /* @__PURE__ */ notImplementedAsync("dns.resolveNs");
const resolvePtr = /* @__PURE__ */ notImplementedAsync("dns.resolvePtr");
const resolveSoa = /* @__PURE__ */ notImplementedAsync("dns.resolveSoa");
const resolveSrv = /* @__PURE__ */ notImplementedAsync("dns.resolveSrv");
const resolveTxt = /* @__PURE__ */ notImplementedAsync("dns.resolveTxt");
const reverse = /* @__PURE__ */ notImplemented("dns.reverse");
const setDefaultResultOrder = noop_default;
const setServers = noop_default;
var dns_default = {
	NODATA,
	FORMERR,
	SERVFAIL,
	NOTFOUND,
	NOTIMP,
	REFUSED,
	BADQUERY,
	BADNAME,
	BADFAMILY,
	BADRESP,
	CONNREFUSED,
	TIMEOUT,
	EOF: "EOF",
	FILE,
	NOMEM,
	DESTRUCTION,
	BADSTR,
	BADFLAGS,
	NONAME,
	BADHINTS,
	NOTINITIALIZED,
	LOADIPHLPAPI,
	ADDRGETNETWORKPARAMS,
	CANCELLED,
	ADDRCONFIG,
	ALL: 256,
	V4MAPPED,
	Resolver,
	getDefaultResultOrder,
	getServers,
	lookup,
	lookupService,
	promises,
	resolve,
	resolve4,
	resolve6,
	resolveAny,
	resolveCaa,
	resolveCname,
	resolveMx,
	resolveNaptr,
	resolveNs,
	resolvePtr,
	resolveSoa,
	resolveSrv,
	resolveTxt,
	reverse,
	setDefaultResultOrder,
	setServers
};
//#endregion
export { ADDRCONFIG, ADDRGETNETWORKPARAMS, ALL, BADFAMILY, BADFLAGS, BADHINTS, BADNAME, BADQUERY, BADRESP, BADSTR, CANCELLED, CONNREFUSED, DESTRUCTION, EOF, FILE, FORMERR, LOADIPHLPAPI, NODATA, NOMEM, NONAME, NOTFOUND, NOTIMP, NOTINITIALIZED, REFUSED, Resolver, SERVFAIL, TIMEOUT, V4MAPPED, dns_default as default, getDefaultResultOrder, getServers, lookup, lookupService, promises, resolve, resolve4, resolve6, resolveAny, resolveCaa, resolveCname, resolveMx, resolveNaptr, resolveNs, resolvePtr, resolveSoa, resolveSrv, resolveTxt, reverse, setDefaultResultOrder, setServers };
