//#region src/nextjs/leftovers.ts
/** Records the listeners that are added to `target`, until `stop()`. */
function recordListeners(target) {
	const own = Object.getOwnPropertyDescriptor(target, "addEventListener");
	const add = target.addEventListener;
	const added = [];
	let recording = true;
	const record = function(...args) {
		if (recording) added.push(args);
		add.apply(this ?? target, args);
	};
	target.addEventListener = record;
	const stop = () => {
		recording = false;
		if (target.addEventListener !== record) return;
		if (own) Object.defineProperty(target, "addEventListener", own);
		else delete target.addEventListener;
	};
	return {
		stop,
		remove() {
			stop();
			for (const args of added.splice(0)) target.removeEventListener(...args);
		}
	};
}
/** Records the message channels that are opened, until `stop()`. */
function recordMessageChannels() {
	const Native = globalThis.MessageChannel;
	const opened = [];
	let recording = true;
	const Recorded = class MessageChannel extends Native {
		constructor() {
			super();
			if (recording) opened.push(this);
		}
	};
	globalThis.MessageChannel = Recorded;
	const stop = () => {
		recording = false;
		if (globalThis.MessageChannel === Recorded) globalThis.MessageChannel = Native;
	};
	return {
		stop,
		remove() {
			stop();
			for (const channel of opened.splice(0)) {
				channel.port1.close();
				channel.port2.close();
			}
		}
	};
}
//#endregion
export { recordMessageChannels as n, recordListeners as t };
