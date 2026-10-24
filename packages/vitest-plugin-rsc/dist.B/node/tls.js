import { Server as Server$1, Socket } from "node:net";
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
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tls/tls-socket.mjs
var TLSSocket = class extends Socket {
	authorized = false;
	encrypted = true;
	alpnProtocol = null;
	authorizationError = /* @__PURE__ */ new Error("[unenv] TLSSocket.authorizationError is not implemented yet!");
	exportKeyingMaterial() {
		throw /* @__PURE__ */ createNotImplementedError("TLSSocket.exportKeyingMaterial");
	}
	getCipher() {
		throw /* @__PURE__ */ createNotImplementedError("TLSSocket.getCipher");
	}
	getPeerCertificate(_detailed) {
		throw /* @__PURE__ */ createNotImplementedError("TLSSocket.getPeerCertificate");
	}
	getCertificate() {
		return null;
	}
	getEphemeralKeyInfo() {
		return null;
	}
	getFinished() {}
	getPeerFinished() {}
	getProtocol() {
		return null;
	}
	getSession() {}
	getSharedSigalgs() {
		return [];
	}
	getTLSTicket() {}
	isSessionReused() {
		return false;
	}
	renegotiate(options, callback) {
		if (typeof callback === "function") callback(null);
	}
	setMaxSendFragment(size) {
		return false;
	}
	disableRenegotiation() {}
	enableTrace() {}
	getPeerX509Certificate() {}
	getX509Certificate() {}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tls/server.mjs
var Server = class extends Server$1 {
	constructor(arg1, arg2) {
		super(arg1, arg2);
	}
	addContext(hostname, context) {}
	setSecureContext(options) {}
	setTicketKeys(_keys) {
		throw /* @__PURE__ */ createNotImplementedError("Server.setTicketKeys");
	}
	getTicketKeys() {
		throw /* @__PURE__ */ createNotImplementedError("Server.getTicketKeys");
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tls/secure-context.mjs
var SecureContext = class {
	context = {};
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tls/constants.mjs
const CLIENT_RENEG_LIMIT = 3;
const CLIENT_RENEG_WINDOW = 600;
const DEFAULT_CIPHERS = "";
const DEFAULT_ECDH_CURVE = "auto";
const DEFAULT_MIN_VERSION = "TLSv1.2";
const DEFAULT_MAX_VERSION = "TLSv1.3";
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/tls.mjs
const connect = function connect() {
	return new TLSSocket();
};
const createServer = function createServer() {
	return new Server();
};
const checkServerIdentity = /* @__PURE__ */ notImplemented("tls.checkServerIdentity");
const convertALPNProtocols = /* @__PURE__ */ notImplemented("tls.convertALPNProtocols");
const createSecureContext = /* @__PURE__ */ notImplemented("tls.createSecureContext");
const createSecurePair = /* @__PURE__ */ notImplemented("tls.createSecurePair");
const getCiphers = /* @__PURE__ */ notImplemented("tls.getCiphers");
const rootCertificates = [];
var tls_default = {
	CLIENT_RENEG_LIMIT: 3,
	CLIENT_RENEG_WINDOW: 600,
	DEFAULT_CIPHERS: "",
	DEFAULT_ECDH_CURVE,
	DEFAULT_MAX_VERSION,
	DEFAULT_MIN_VERSION,
	SecureContext,
	Server,
	TLSSocket,
	checkServerIdentity,
	connect,
	convertALPNProtocols,
	createSecureContext,
	createSecurePair,
	createServer,
	getCiphers,
	rootCertificates
};
//#endregion
export { CLIENT_RENEG_LIMIT, CLIENT_RENEG_WINDOW, DEFAULT_CIPHERS, DEFAULT_ECDH_CURVE, DEFAULT_MAX_VERSION, DEFAULT_MIN_VERSION, SecureContext, Server, TLSSocket, checkServerIdentity, connect, convertALPNProtocols, createSecureContext, createSecurePair, createServer, tls_default as default, getCiphers, rootCertificates };
