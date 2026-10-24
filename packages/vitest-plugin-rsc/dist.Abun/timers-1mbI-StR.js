//#region src/timers.ts
/** The key of the timers on a module's `import.meta`. */
const timersKey = "__vitest_plugin_rsc_timers__";
/** The globals that start a timer. */
const timerNames = [
	"setTimeout",
	"setInterval",
	"requestAnimationFrame",
	"requestIdleCallback"
];
const globals = globalThis;
/**
* The timers of a runner: each the global as the module reads it, as it
* reads a global, also the fake one of a test, and nothing where the browser
* has none. They call nothing once `isClosed()`, and an interval that would
* fire then is cleared.
*/
function runnerTimers(isClosed) {
	const timers = {};
	for (const name of timerNames) {
		const wrapped = /* @__PURE__ */ new WeakMap();
		Object.defineProperty(timers, name, {
			enumerable: true,
			get: () => {
				const timer = globals[name];
				if (!timer) return void 0;
				let ofModule = wrapped.get(timer);
				if (!ofModule) {
					ofModule = name === "setInterval" ? droppingInterval(timer, isClosed) : dropping(timer, isClosed);
					wrapped.set(timer, ofModule);
				}
				return ofModule;
			},
			set: (value) => {
				globals[name] = value;
			}
		});
	}
	return timers;
}
const ofRunner = (callback, isClosed) => function(...args) {
	if (!isClosed()) callback.apply(this, args);
};
const dropping = (timer, isClosed) => (callback, ...args) => timer(typeof callback === "function" ? ofRunner(callback, isClosed) : callback, ...args);
const droppingInterval = (timer, isClosed) => (callback, ...args) => {
	if (typeof callback !== "function") return timer(callback, ...args);
	const call = ofRunner(callback, isClosed);
	const id = timer(function(...callbackArgs) {
		if (isClosed()) globalThis.clearInterval(id);
		call.apply(this, callbackArgs);
	}, ...args);
	return id;
};
//#endregion
export { timerNames as n, timersKey as r, runnerTimers as t };
