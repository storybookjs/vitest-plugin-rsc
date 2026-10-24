import { EventEmitter } from "node:events";
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
/* @__NO_SIDE_EFFECTS__ */
function createNotImplementedError(name) {
	return /* @__PURE__ */ new Error(`[unenv] ${name} is not implemented yet!`);
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/domain/domain.mjs
var Domain = class extends EventEmitter {
	__unenv__ = true;
	members = [];
	add() {}
	enter() {}
	exit() {}
	remove() {}
	bind(callback) {
		throw /* @__PURE__ */ createNotImplementedError("Domain.bind");
	}
	intercept(callback) {
		throw /* @__PURE__ */ createNotImplementedError("Domain.intercept");
	}
	run(fn, ...args) {
		throw /* @__PURE__ */ createNotImplementedError("Domain.run");
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/domain.mjs
const create = function() {
	return new Domain();
};
const createDomain = create;
const _domain = create();
const active = () => _domain;
const _stack = [];
var domain_default = {
	Domain,
	_stack,
	active,
	create,
	createDomain
};
//#endregion
export { Domain, _stack, active, create, createDomain, domain_default as default };
