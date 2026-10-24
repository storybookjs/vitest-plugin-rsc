import { EventEmitter } from "node:events";
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/readline/interface.mjs
var Interface$1 = class extends EventEmitter {
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/readline/promises/interface.mjs
var Interface = class extends Interface$1 {
	question(query, options) {
		return Promise.resolve("");
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/readline/promises/readline.mjs
var Readline = class {
	clearLine(dir) {
		return this;
	}
	clearScreenDown() {
		return this;
	}
	commit() {
		return Promise.resolve();
	}
	cursorTo(x, y) {
		return this;
	}
	moveCursor(dx, dy) {
		return this;
	}
	rollback() {
		return this;
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/readline/promises.mjs
const createInterface = () => new Interface();
var promises_default = {
	Interface,
	Readline,
	createInterface
};
//#endregion
export { Interface, Readline, createInterface, promises_default as default };
