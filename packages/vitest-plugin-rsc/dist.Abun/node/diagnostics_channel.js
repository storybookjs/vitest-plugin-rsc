//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
/* @__NO_SIDE_EFFECTS__ */
function createNotImplementedError(name) {
	return /* @__PURE__ */ new Error(`[unenv] ${name} is not implemented yet!`);
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/diagnostics_channel/channel.mjs
const channels = {};
const getChannels = () => channels;
var Channel = class {
	__unenv__ = true;
	name;
	get hasSubscribers() {
		return this._subscribers.length > 0;
	}
	_subscribers;
	constructor(name) {
		this.name = name;
		this._subscribers = [];
		const channels = getChannels();
		channels[name] = this;
	}
	subscribe(onMessage) {
		this._subscribers.push(onMessage);
	}
	unsubscribe(onMessage) {
		const index = this._subscribers.indexOf(onMessage);
		if (index === -1) return false;
		this._subscribers.splice(index, 1);
		return true;
	}
	publish(message) {
		for (const subscriber of this._subscribers) subscriber(message, this.name);
	}
	bindStore() {
		throw /* @__PURE__ */ createNotImplementedError("Channel.bindStore");
	}
	unbindStore() {
		throw /* @__PURE__ */ createNotImplementedError("Channel.unbindStore");
	}
	runStores() {
		throw /* @__PURE__ */ createNotImplementedError("Channel.runStores");
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/diagnostics_channel/tracing-channel.mjs
var TracingChannel = class {
	__unenv__ = true;
	asyncEnd = new Channel("asyncEnd");
	asyncStart = new Channel("asyncStart");
	end = new Channel("end");
	error = new Channel("error");
	start = new Channel("start");
	constructor(nameOrChannels) {
		if (typeof nameOrChannels === "string") {
			this.asyncEnd = new Channel(`trace:${nameOrChannels}:asyncEnd`);
			this.asyncStart = new Channel(`trace:${nameOrChannels}:asyncStart`);
			this.end = new Channel(`trace:${nameOrChannels}:end`);
			this.error = new Channel(`trace:${nameOrChannels}:error`);
			this.start = new Channel(`trace:${nameOrChannels}:start`);
		} else {
			this.asyncStart = nameOrChannels.asyncStart;
			this.asyncEnd = nameOrChannels.asyncEnd;
			this.end = nameOrChannels.end;
			this.error = nameOrChannels.error;
			this.start = nameOrChannels.start;
		}
	}
	subscribe(handlers) {
		this.asyncEnd?.subscribe(handlers.asyncEnd);
		this.asyncStart?.subscribe(handlers.asyncStart);
		this.end?.subscribe(handlers.end);
		this.error?.subscribe(handlers.error);
		this.start?.subscribe(handlers.start);
	}
	unsubscribe(handlers) {
		this.asyncEnd?.unsubscribe(handlers.asyncEnd);
		this.asyncStart?.unsubscribe(handlers.asyncStart);
		this.end?.unsubscribe(handlers.end);
		this.error?.unsubscribe(handlers.error);
		this.start?.unsubscribe(handlers.start);
	}
	traceSync() {
		throw /* @__PURE__ */ createNotImplementedError("TracingChannel.traceSync");
	}
	tracePromise() {
		throw /* @__PURE__ */ createNotImplementedError("TracingChannel.tracePromise");
	}
	traceCallback() {
		throw /* @__PURE__ */ createNotImplementedError("TracingChannel.traceCallback");
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/diagnostics_channel.mjs
const channel = function(name) {
	const channels = getChannels();
	if (name in channels) return channels[name];
	return new Channel(name);
};
const hasSubscribers = function(name) {
	const channel = getChannels()[name];
	return channel && channel.hasSubscribers;
};
const subscribe = function(name, onMessage) {
	channel(name).subscribe(onMessage);
};
const unsubscribe = function(name, onMessage) {
	return channel(name).unsubscribe(onMessage);
};
const tracingChannel = function(name) {
	return new TracingChannel(name);
};
var diagnostics_channel_default = {
	Channel,
	channel,
	hasSubscribers,
	subscribe,
	tracingChannel,
	unsubscribe
};
//#endregion
export { Channel, channel, diagnostics_channel_default as default, hasSubscribers, subscribe, tracingChannel, unsubscribe };
