//#region src/nextjs/registry-global.ts
const registryGlobal = "__vitest_plugin_rsc_next__";
//#endregion
//#region src/node/timers.ts
const registry = () => globalThis[registryGlobal];
const setImmediate$1 = (callback, ...args) => registry().setImmediate(callback, ...args);
const clearImmediate = (id) => registry().clearImmediate(id);
const setTimeout$1 = (callback, delay, ...args) => globalThis.setTimeout(callback, delay, ...args);
const clearTimeout = (id) => globalThis.clearTimeout(id);
//#endregion
//#region src/node/timers/promises.ts
const aborted = (signal) => Object.assign(/* @__PURE__ */ new Error("The operation was aborted"), {
	name: "AbortError",
	code: "ABORT_ERR",
	cause: signal.reason
});
const after = (start, clear, value, options) => new Promise((resolve, reject) => {
	const signal = options?.signal;
	if (signal?.aborted) return reject(aborted(signal));
	const abort = () => {
		clear(id);
		reject(aborted(signal));
	};
	const id = start(() => {
		signal?.removeEventListener("abort", abort);
		resolve(value);
	});
	signal?.addEventListener("abort", abort, { once: true });
});
const setTimeout = (delay, value, options) => after((done) => setTimeout$1(done, delay), (id) => clearTimeout(id), value, options);
const setImmediate = (value, options) => after((done) => setImmediate$1(done), clearImmediate, value, options);
async function* setInterval(delay, value, options) {
	const signal = options?.signal;
	if (signal?.aborted) throw aborted(signal);
	let pending = 0;
	let wake;
	const tick = () => {
		pending++;
		wake?.();
	};
	const id = globalThis.setInterval(tick, delay);
	signal?.addEventListener("abort", tick, { once: true });
	try {
		for (;;) {
			while (pending === 0 && !signal?.aborted) {
				await new Promise((resolve) => {
					wake = resolve;
				});
				wake = void 0;
			}
			if (signal?.aborted) throw aborted(signal);
			pending--;
			yield value;
		}
	} finally {
		globalThis.clearInterval(id);
		signal?.removeEventListener("abort", tick);
	}
}
const scheduler = {
	wait: (delay, options) => setTimeout(delay, void 0, options),
	yield: () => setImmediate()
};
var promises_default = {
	setTimeout,
	setImmediate,
	setInterval,
	scheduler
};
//#endregion
export { promises_default as default, scheduler, setImmediate, setInterval, setTimeout };
