import promises from "node:readline/promises";
import { EventEmitter } from "node:events";
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {}, { __unenv__: true });
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/readline/interface.mjs
var Interface = class extends EventEmitter {
	terminal = false;
	line = "";
	cursor = 0;
	getPrompt() {
		return "";
	}
	setPrompt(prompt) {}
	prompt(preserveCursor) {}
	question(query, options, callback) {
		callback && typeof callback === "function" && callback("");
	}
	resume() {
		return this;
	}
	close() {}
	write(data, key) {}
	getCursorPos() {
		return {
			rows: 0,
			cols: 0
		};
	}
	pause() {
		return this;
	}
	async *[Symbol.asyncIterator]() {
		yield "";
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/readline.mjs
const clearLine = () => false;
const clearScreenDown = () => false;
const createInterface = () => new Interface();
const cursorTo = () => false;
const emitKeypressEvents = noop_default;
const moveCursor = () => false;
var readline_default = {
	clearLine,
	clearScreenDown,
	createInterface,
	cursorTo,
	emitKeypressEvents,
	moveCursor,
	Interface,
	promises
};
//#endregion
export { Interface, clearLine, clearScreenDown, createInterface, cursorTo, readline_default as default, emitKeypressEvents, moveCursor, promises };
