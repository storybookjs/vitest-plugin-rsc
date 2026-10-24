import { Socket } from "node:net";
import { Readable, Writable } from "node:stream";
import { EventEmitter } from "node:events";
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
/* @__NO_SIDE_EFFECTS__ */
function rawHeaders(headers) {
	const rawHeaders = [];
	for (const key in headers) if (Array.isArray(headers[key])) for (const h of headers[key]) rawHeaders.push(key, h);
	else rawHeaders.push(key, headers[key]);
	return rawHeaders;
}
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
function notImplementedClass(name) {
	return class {
		__unenv__ = true;
		constructor() {
			throw new Error(`[unenv] ${name} is not implemented yet!`);
		}
	};
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/http/request.mjs
var IncomingMessage = class extends Readable {
	__unenv__ = {};
	aborted = false;
	httpVersion = "1.1";
	httpVersionMajor = 1;
	httpVersionMinor = 1;
	complete = true;
	connection;
	socket;
	headers = {};
	trailers = {};
	method = "GET";
	url = "/";
	statusCode = 200;
	statusMessage = "";
	closed = false;
	errored = null;
	readable = false;
	constructor(socket) {
		super();
		this.socket = this.connection = socket || new Socket();
	}
	get rawHeaders() {
		return /* @__PURE__ */ rawHeaders(this.headers);
	}
	get rawTrailers() {
		return [];
	}
	setTimeout(_msecs, _callback) {
		return this;
	}
	get headersDistinct() {
		return _distinct(this.headers);
	}
	get trailersDistinct() {
		return _distinct(this.trailers);
	}
	_read() {}
};
function _distinct(obj) {
	const d = {};
	for (const [key, value] of Object.entries(obj)) if (key) d[key] = (Array.isArray(value) ? value : [value]).filter(Boolean);
	return d;
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/http/response.mjs
var ServerResponse = class extends Writable {
	__unenv__ = true;
	statusCode = 200;
	statusMessage = "";
	upgrading = false;
	chunkedEncoding = false;
	shouldKeepAlive = false;
	useChunkedEncodingByDefault = false;
	sendDate = false;
	finished = false;
	headersSent = false;
	strictContentLength = false;
	connection = null;
	socket = null;
	req;
	_headers = {};
	constructor(req) {
		super();
		this.req = req;
	}
	assignSocket(socket) {
		socket._httpMessage = this;
		this.socket = socket;
		this.connection = socket;
		this.emit("socket", socket);
		this._flush();
	}
	_flush() {
		this.flushHeaders();
	}
	detachSocket(_socket) {}
	writeContinue(_callback) {}
	writeHead(statusCode, arg1, arg2) {
		if (statusCode) this.statusCode = statusCode;
		if (typeof arg1 === "string") {
			this.statusMessage = arg1;
			arg1 = void 0;
		}
		const headers = arg2 || arg1;
		if (headers) {
			if (Array.isArray(headers)) {} else for (const key in headers) this.setHeader(key, headers[key]);
		}
		this.headersSent = true;
		return this;
	}
	writeProcessing() {}
	setTimeout(_msecs, _callback) {
		return this;
	}
	appendHeader(name, value) {
		name = name.toLowerCase();
		const current = this._headers[name];
		const all = [...Array.isArray(current) ? current : [current], ...Array.isArray(value) ? value : [value]].filter(Boolean);
		this._headers[name] = all.length > 1 ? all : all[0];
		return this;
	}
	setHeader(name, value) {
		this._headers[name.toLowerCase()] = Array.isArray(value) ? [...value] : value;
		return this;
	}
	setHeaders(headers) {
		for (const [key, value] of headers.entries()) this.setHeader(key, value);
		return this;
	}
	getHeader(name) {
		return this._headers[name.toLowerCase()];
	}
	getHeaders() {
		return this._headers;
	}
	getHeaderNames() {
		return Object.keys(this._headers);
	}
	hasHeader(name) {
		return name.toLowerCase() in this._headers;
	}
	removeHeader(name) {
		delete this._headers[name.toLowerCase()];
	}
	addTrailers(_headers) {}
	flushHeaders() {}
	writeEarlyHints(_headers, cb) {
		if (typeof cb === "function") cb();
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/http/agent.mjs
var Agent = class extends EventEmitter {
	__unenv__ = {};
	maxFreeSockets = 256;
	maxSockets = Infinity;
	maxTotalSockets = Infinity;
	freeSockets = {};
	sockets = {};
	requests = {};
	options;
	constructor(opts = {}) {
		super();
		this.options = opts;
	}
	destroy() {}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/http/constants.mjs
const METHODS = [
	"ACL",
	"BIND",
	"CHECKOUT",
	"CONNECT",
	"COPY",
	"DELETE",
	"GET",
	"HEAD",
	"LINK",
	"LOCK",
	"M-SEARCH",
	"MERGE",
	"MKACTIVITY",
	"MKCALENDAR",
	"MKCOL",
	"MOVE",
	"NOTIFY",
	"OPTIONS",
	"PATCH",
	"POST",
	"PRI",
	"PROPFIND",
	"PROPPATCH",
	"PURGE",
	"PUT",
	"REBIND",
	"REPORT",
	"SEARCH",
	"SOURCE",
	"SUBSCRIBE",
	"TRACE",
	"UNBIND",
	"UNLINK",
	"UNLOCK",
	"UNSUBSCRIBE"
];
const STATUS_CODES = {
	100: "Continue",
	101: "Switching Protocols",
	102: "Processing",
	103: "Early Hints",
	200: "OK",
	201: "Created",
	202: "Accepted",
	203: "Non-Authoritative Information",
	204: "No Content",
	205: "Reset Content",
	206: "Partial Content",
	207: "Multi-Status",
	208: "Already Reported",
	226: "IM Used",
	300: "Multiple Choices",
	301: "Moved Permanently",
	302: "Found",
	303: "See Other",
	304: "Not Modified",
	305: "Use Proxy",
	307: "Temporary Redirect",
	308: "Permanent Redirect",
	400: "Bad Request",
	401: "Unauthorized",
	402: "Payment Required",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	406: "Not Acceptable",
	407: "Proxy Authentication Required",
	408: "Request Timeout",
	409: "Conflict",
	410: "Gone",
	411: "Length Required",
	412: "Precondition Failed",
	413: "Payload Too Large",
	414: "URI Too Long",
	415: "Unsupported Media Type",
	416: "Range Not Satisfiable",
	417: "Expectation Failed",
	418: "I'm a Teapot",
	421: "Misdirected Request",
	422: "Unprocessable Entity",
	423: "Locked",
	424: "Failed Dependency",
	425: "Too Early",
	426: "Upgrade Required",
	428: "Precondition Required",
	429: "Too Many Requests",
	431: "Request Header Fields Too Large",
	451: "Unavailable For Legal Reasons",
	500: "Internal Server Error",
	501: "Not Implemented",
	502: "Bad Gateway",
	503: "Service Unavailable",
	504: "Gateway Timeout",
	505: "HTTP Version Not Supported",
	506: "Variant Also Negotiates",
	507: "Insufficient Storage",
	508: "Loop Detected",
	509: "Bandwidth Limit Exceeded",
	510: "Not Extended",
	511: "Network Authentication Required"
};
const maxHeaderSize = 16384;
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/http.mjs
const createServer = /* @__PURE__ */ notImplemented("http.createServer");
const request = /* @__PURE__ */ notImplemented("http.request");
const get = /* @__PURE__ */ notImplemented("http.get");
const Server = /* @__PURE__ */ notImplementedClass("http.Server");
const OutgoingMessage = /* @__PURE__ */ notImplementedClass("http.OutgoingMessage");
const ClientRequest = /* @__PURE__ */ notImplementedClass("http.ClientRequest");
const globalAgent = new Agent();
const validateHeaderName = /* @__PURE__ */ notImplemented("http.validateHeaderName");
const validateHeaderValue = /* @__PURE__ */ notImplemented("http.validateHeaderValue");
const setMaxIdleHTTPParsers = /* @__PURE__ */ notImplemented("http.setMaxIdleHTTPParsers");
const _connectionListener = /* @__PURE__ */ notImplemented("http._connectionListener");
const WebSocket = globalThis.WebSocket || /* @__PURE__ */ notImplementedClass("WebSocket");
const CloseEvent = globalThis.CloseEvent || /* @__PURE__ */ notImplementedClass("CloseEvent");
const MessageEvent = globalThis.MessageEvent || /* @__PURE__ */ notImplementedClass("MessageEvent");
var http_default = {
	METHODS,
	STATUS_CODES,
	maxHeaderSize,
	IncomingMessage,
	ServerResponse,
	WebSocket,
	CloseEvent,
	MessageEvent,
	createServer,
	request,
	get,
	Server,
	OutgoingMessage,
	ClientRequest,
	Agent,
	globalAgent,
	validateHeaderName,
	validateHeaderValue,
	setMaxIdleHTTPParsers,
	_connectionListener
};
//#endregion
export { Agent, ClientRequest, CloseEvent, IncomingMessage, METHODS, MessageEvent, OutgoingMessage, STATUS_CODES, Server, ServerResponse, WebSocket, _connectionListener, createServer, http_default as default, get, globalAgent, maxHeaderSize, request, setMaxIdleHTTPParsers, validateHeaderName, validateHeaderValue };
