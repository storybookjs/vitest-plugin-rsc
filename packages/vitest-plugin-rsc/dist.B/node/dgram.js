import { EventEmitter } from "node:events";
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {}, { __unenv__: true });
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/dgram/socket.mjs
var Socket = class extends EventEmitter {
	__unenv__ = true;
	bind() {
		return this;
	}
	close() {
		return this;
	}
	ref() {
		return this;
	}
	unref() {
		return this;
	}
	getRecvBufferSize() {
		return 1e5;
	}
	getSendBufferSize() {
		return 1e4;
	}
	getSendQueueSize() {
		return 0;
	}
	getSendQueueCount() {
		return 0;
	}
	setMulticastLoopback() {
		return false;
	}
	setMulticastTTL() {
		return 1;
	}
	setTTL() {
		return 1;
	}
	address() {
		return {
			address: "127.0.0.1",
			family: "IPv4",
			port: 1234
		};
	}
	remoteAddress() {
		throw new Error("ERR_SOCKET_DGRAM_NOT_CONNECTED");
	}
	[Symbol.asyncDispose]() {
		return Promise.resolve();
	}
	addMembership() {}
	addSourceSpecificMembership() {}
	connect() {}
	disconnect() {}
	dropMembership() {}
	dropSourceSpecificMembership() {}
	send() {}
	setSendBufferSize() {}
	setBroadcast() {}
	setRecvBufferSize() {}
	setMulticastInterface() {}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/dgram.mjs
const _createSocketHandle = noop_default;
const createSocket = function() {
	return new Socket();
};
var dgram_default = {
	Socket,
	_createSocketHandle,
	createSocket
};
//#endregion
export { Socket, _createSocketHandle, createSocket, dgram_default as default };
