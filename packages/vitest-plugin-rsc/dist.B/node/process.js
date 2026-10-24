import { EventEmitter } from "node:events";
import { ReadStream, WriteStream } from "node:tty";
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
const NODE_VERSION = "22.14.0";
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class Process extends EventEmitter {
	env;
	hrtime;
	nextTick;
	constructor(impl) {
		super();
		this.env = impl.env;
		this.hrtime = impl.hrtime;
		this.nextTick = impl.nextTick;
		for (const prop of [...Object.getOwnPropertyNames(Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
			const value = this[prop];
			if (typeof value === "function") this[prop] = value.bind(this);
		}
	}
	emitWarning(warning, type, code) {
		console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
	}
	emit(...args) {
		return super.emit(...args);
	}
	listeners(eventName) {
		return super.listeners(eventName);
	}
	#stdin;
	#stdout;
	#stderr;
	get stdin() {
		return this.#stdin ??= new ReadStream(0);
	}
	get stdout() {
		return this.#stdout ??= new WriteStream(1);
	}
	get stderr() {
		return this.#stderr ??= new WriteStream(2);
	}
	#cwd = "/";
	chdir(cwd) {
		this.#cwd = cwd;
	}
	cwd() {
		return this.#cwd;
	}
	arch = "";
	platform = "";
	argv = [];
	argv0 = "";
	execArgv = [];
	execPath = "";
	title = "";
	pid = 200;
	ppid = 100;
	get version() {
		return `v${NODE_VERSION}`;
	}
	get versions() {
		return { node: NODE_VERSION };
	}
	get allowedNodeEnvironmentFlags() {
		return /* @__PURE__ */ new Set();
	}
	get sourceMapsEnabled() {
		return false;
	}
	get debugPort() {
		return 0;
	}
	get throwDeprecation() {
		return false;
	}
	get traceDeprecation() {
		return false;
	}
	get features() {
		return {};
	}
	get release() {
		return {};
	}
	get connected() {
		return false;
	}
	get config() {
		return {};
	}
	get moduleLoadList() {
		return [];
	}
	constrainedMemory() {
		return 0;
	}
	availableMemory() {
		return 0;
	}
	uptime() {
		return 0;
	}
	resourceUsage() {
		return {};
	}
	ref() {}
	unref() {}
	umask() {
		throw /* @__PURE__ */ createNotImplementedError("process.umask");
	}
	getBuiltinModule() {}
	getActiveResourcesInfo() {
		throw /* @__PURE__ */ createNotImplementedError("process.getActiveResourcesInfo");
	}
	exit() {
		throw /* @__PURE__ */ createNotImplementedError("process.exit");
	}
	reallyExit() {
		throw /* @__PURE__ */ createNotImplementedError("process.reallyExit");
	}
	kill() {
		throw /* @__PURE__ */ createNotImplementedError("process.kill");
	}
	abort() {
		throw /* @__PURE__ */ createNotImplementedError("process.abort");
	}
	dlopen() {
		throw /* @__PURE__ */ createNotImplementedError("process.dlopen");
	}
	setSourceMapsEnabled() {
		throw /* @__PURE__ */ createNotImplementedError("process.setSourceMapsEnabled");
	}
	loadEnvFile() {
		throw /* @__PURE__ */ createNotImplementedError("process.loadEnvFile");
	}
	disconnect() {
		throw /* @__PURE__ */ createNotImplementedError("process.disconnect");
	}
	cpuUsage() {
		throw /* @__PURE__ */ createNotImplementedError("process.cpuUsage");
	}
	setUncaughtExceptionCaptureCallback() {
		throw /* @__PURE__ */ createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
	}
	hasUncaughtExceptionCaptureCallback() {
		throw /* @__PURE__ */ createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
	}
	initgroups() {
		throw /* @__PURE__ */ createNotImplementedError("process.initgroups");
	}
	openStdin() {
		throw /* @__PURE__ */ createNotImplementedError("process.openStdin");
	}
	assert() {
		throw /* @__PURE__ */ createNotImplementedError("process.assert");
	}
	binding() {
		throw /* @__PURE__ */ createNotImplementedError("process.binding");
	}
	permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
	report = {
		directory: "",
		filename: "",
		signal: "SIGUSR2",
		compact: false,
		reportOnFatalError: false,
		reportOnSignal: false,
		reportOnUncaughtException: false,
		getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
		writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
	};
	finalization = {
		register: /* @__PURE__ */ notImplemented("process.finalization.register"),
		unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
		registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
	};
	memoryUsage = Object.assign(() => ({
		arrayBuffers: 0,
		rss: 0,
		external: 0,
		heapTotal: 0,
		heapUsed: 0
	}), { rss: () => 0 });
	mainModule = void 0;
	domain = void 0;
	send = void 0;
	exitCode = void 0;
	channel = void 0;
	getegid = void 0;
	geteuid = void 0;
	getgid = void 0;
	getgroups = void 0;
	getuid = void 0;
	setegid = void 0;
	seteuid = void 0;
	setgid = void 0;
	setgroups = void 0;
	setuid = void 0;
	_events = void 0;
	_eventsCount = void 0;
	_exiting = void 0;
	_maxListeners = void 0;
	_debugEnd = void 0;
	_debugProcess = void 0;
	_fatalException = void 0;
	_getActiveHandles = void 0;
	_getActiveRequests = void 0;
	_kill = void 0;
	_preload_modules = void 0;
	_rawDebug = void 0;
	_startProfilerIdleNotifier = void 0;
	_stopProfilerIdleNotifier = void 0;
	_tickCallback = void 0;
	_disconnect = void 0;
	_handleQueue = void 0;
	_pendingMessage = void 0;
	_channel = void 0;
	_send = void 0;
	_linkedBinding = void 0;
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/env.mjs
const _envShim = Object.create(null);
const originalProcess = globalThis["process"];
const _getEnv = (useShim) => globalThis.__env__ || originalProcess?.env || (useShim ? _envShim : globalThis);
const env$2 = /* @__PURE__ */ new Proxy(_envShim, {
	get(_, prop) {
		return _getEnv()[prop] ?? _envShim[prop];
	},
	has(_, prop) {
		return prop in _getEnv() || prop in _envShim;
	},
	set(_, prop, value) {
		const env = _getEnv(true);
		env[prop] = value;
		return true;
	},
	deleteProperty(_, prop) {
		const env = _getEnv(true);
		delete env[prop];
		return true;
	},
	ownKeys() {
		const env = _getEnv();
		return Object.keys(env);
	},
	getOwnPropertyDescriptor(_, prop) {
		const env = _getEnv();
		if (prop in env) return {
			value: env[prop],
			writable: true,
			enumerable: true,
			configurable: true
		};
	}
});
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
const hrtime$2 = /* @__PURE__ */ Object.assign(function hrtime(startTime) {
	const now = Date.now();
	const seconds = Math.trunc(now / 1e3);
	const nanos = now % 1e3 * 1e6;
	if (startTime) {
		let diffSeconds = seconds - startTime[0];
		let diffNanos = nanos - startTime[0];
		if (diffNanos < 0) {
			diffSeconds = diffSeconds - 1;
			diffNanos = 1e9 + diffNanos;
		}
		return [diffSeconds, diffNanos];
	}
	return [seconds, nanos];
}, { bigint: function bigint() {
	return BigInt(Date.now() * 1e6);
} });
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/nexttick.mjs
const nextTick$2 = globalThis.queueMicrotask ? (cb, ...args) => {
	globalThis.queueMicrotask(cb.bind(void 0, ...args));
} : /* @__PURE__ */ createNextTickWithTimeout();
function createNextTickWithTimeout() {
	let queue = [];
	let draining = false;
	let currentQueue;
	let queueIndex = -1;
	function cleanUpNextTick() {
		if (!draining || !currentQueue) return;
		draining = false;
		if (currentQueue.length > 0) queue = [...currentQueue, ...queue];
		else queueIndex = -1;
		if (queue.length > 0) drainQueue();
	}
	function drainQueue() {
		if (draining) return;
		const timeout = setTimeout(cleanUpNextTick);
		draining = true;
		let len = queue.length;
		while (len) {
			currentQueue = queue;
			queue = [];
			while (++queueIndex < len) if (currentQueue) currentQueue[queueIndex]();
			queueIndex = -1;
			len = queue.length;
		}
		currentQueue = void 0;
		draining = false;
		clearTimeout(timeout);
	}
	const nextTick = (cb, ...args) => {
		queue.push(cb.bind(void 0, ...args));
		if (queue.length === 1 && !draining) setTimeout(drainQueue);
	};
	return nextTick;
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/process.mjs
const unenvProcess = new Process({
	env: env$2,
	hrtime: hrtime$2,
	nextTick: nextTick$2
});
const { abort: abort$1, addListener: addListener$1, allowedNodeEnvironmentFlags: allowedNodeEnvironmentFlags$1, hasUncaughtExceptionCaptureCallback: hasUncaughtExceptionCaptureCallback$1, setUncaughtExceptionCaptureCallback: setUncaughtExceptionCaptureCallback$1, loadEnvFile: loadEnvFile$1, sourceMapsEnabled: sourceMapsEnabled$1, arch: arch$1, argv: argv$1, argv0: argv0$1, chdir: chdir$1, config: config$1, connected: connected$1, constrainedMemory: constrainedMemory$1, availableMemory: availableMemory$1, cpuUsage: cpuUsage$1, cwd: cwd$1, debugPort: debugPort$1, dlopen: dlopen$1, disconnect: disconnect$1, emit: emit$1, emitWarning: emitWarning$1, env: env$1, eventNames: eventNames$1, execArgv: execArgv$1, execPath: execPath$1, exit: exit$1, finalization: finalization$1, features: features$1, getBuiltinModule: getBuiltinModule$1, getActiveResourcesInfo: getActiveResourcesInfo$1, getMaxListeners: getMaxListeners$1, hrtime: hrtime$1, kill: kill$1, listeners: listeners$1, listenerCount: listenerCount$1, memoryUsage: memoryUsage$1, nextTick: nextTick$1, on: on$1, off: off$1, once: once$1, pid: pid$1, platform: platform$1, ppid: ppid$1, prependListener: prependListener$1, prependOnceListener: prependOnceListener$1, rawListeners: rawListeners$1, release: release$1, removeAllListeners: removeAllListeners$1, removeListener: removeListener$1, report: report$1, resourceUsage: resourceUsage$1, setMaxListeners: setMaxListeners$1, setSourceMapsEnabled: setSourceMapsEnabled$1, stderr: stderr$1, stdin: stdin$1, stdout: stdout$1, title: title$1, umask: umask$1, uptime: uptime$1, version: version$1, versions: versions$1, domain: domain$1, initgroups: initgroups$1, moduleLoadList: moduleLoadList$1, reallyExit: reallyExit$1, openStdin: openStdin$1, assert: assert$1, binding: binding$1, send: send$1, exitCode: exitCode$1, channel: channel$1, getegid: getegid$1, geteuid: geteuid$1, getgid: getgid$1, getgroups: getgroups$1, getuid: getuid$1, setegid: setegid$1, seteuid: seteuid$1, setgid: setgid$1, setgroups: setgroups$1, setuid: setuid$1, permission: permission$1, mainModule: mainModule$1, ref: ref$1, unref: unref$1, _events: _events$1, _eventsCount: _eventsCount$1, _exiting: _exiting$1, _maxListeners: _maxListeners$1, _debugEnd: _debugEnd$1, _debugProcess: _debugProcess$1, _fatalException: _fatalException$1, _getActiveHandles: _getActiveHandles$1, _getActiveRequests: _getActiveRequests$1, _kill: _kill$1, _preload_modules: _preload_modules$1, _rawDebug: _rawDebug$1, _startProfilerIdleNotifier: _startProfilerIdleNotifier$1, _stopProfilerIdleNotifier: _stopProfilerIdleNotifier$1, _tickCallback: _tickCallback$1, _disconnect: _disconnect$1, _handleQueue: _handleQueue$1, _pendingMessage: _pendingMessage$1, _channel: _channel$1, _send: _send$1, _linkedBinding: _linkedBinding$1 } = unenvProcess;
//#endregion
//#region src/node/process.ts
const process = globalThis.process ??= { env: {} };
const fallback = unenvProcess;
var process_default = new Proxy(process, {
	get: (target, key) => target[key] ?? fallback[key],
	has: (target, key) => key in target || key in fallback
});
const abort = process.abort ?? unenvProcess.abort;
const addListener = process.addListener ?? unenvProcess.addListener;
const allowedNodeEnvironmentFlags = process.allowedNodeEnvironmentFlags ?? unenvProcess.allowedNodeEnvironmentFlags;
const hasUncaughtExceptionCaptureCallback = process.hasUncaughtExceptionCaptureCallback ?? unenvProcess.hasUncaughtExceptionCaptureCallback;
const setUncaughtExceptionCaptureCallback = process.setUncaughtExceptionCaptureCallback ?? unenvProcess.setUncaughtExceptionCaptureCallback;
const loadEnvFile = process.loadEnvFile ?? unenvProcess.loadEnvFile;
const sourceMapsEnabled = process.sourceMapsEnabled ?? unenvProcess.sourceMapsEnabled;
const arch = process.arch ?? unenvProcess.arch;
const argv = process.argv ?? unenvProcess.argv;
const argv0 = process.argv0 ?? unenvProcess.argv0;
const chdir = process.chdir ?? unenvProcess.chdir;
const config = process.config ?? unenvProcess.config;
const connected = process.connected ?? unenvProcess.connected;
const constrainedMemory = process.constrainedMemory ?? unenvProcess.constrainedMemory;
const availableMemory = process.availableMemory ?? unenvProcess.availableMemory;
const cpuUsage = process.cpuUsage ?? unenvProcess.cpuUsage;
const cwd = process.cwd ?? unenvProcess.cwd;
const debugPort = process.debugPort ?? unenvProcess.debugPort;
const dlopen = process.dlopen ?? unenvProcess.dlopen;
const disconnect = process.disconnect ?? unenvProcess.disconnect;
const emit = process.emit ?? unenvProcess.emit;
const emitWarning = process.emitWarning ?? unenvProcess.emitWarning;
const env = process.env ?? unenvProcess.env;
const eventNames = process.eventNames ?? unenvProcess.eventNames;
const execArgv = process.execArgv ?? unenvProcess.execArgv;
const execPath = process.execPath ?? unenvProcess.execPath;
const exit = process.exit ?? unenvProcess.exit;
const finalization = process.finalization ?? unenvProcess.finalization;
const features = process.features ?? unenvProcess.features;
const getBuiltinModule = process.getBuiltinModule ?? unenvProcess.getBuiltinModule;
const getActiveResourcesInfo = process.getActiveResourcesInfo ?? unenvProcess.getActiveResourcesInfo;
const getMaxListeners = process.getMaxListeners ?? unenvProcess.getMaxListeners;
const hrtime = process.hrtime ?? unenvProcess.hrtime;
const kill = process.kill ?? unenvProcess.kill;
const listeners = process.listeners ?? unenvProcess.listeners;
const listenerCount = process.listenerCount ?? unenvProcess.listenerCount;
const memoryUsage = process.memoryUsage ?? unenvProcess.memoryUsage;
const nextTick = process.nextTick ?? unenvProcess.nextTick;
const on = process.on ?? unenvProcess.on;
const off = process.off ?? unenvProcess.off;
const once = process.once ?? unenvProcess.once;
const pid = process.pid ?? unenvProcess.pid;
const platform = process.platform ?? unenvProcess.platform;
const ppid = process.ppid ?? unenvProcess.ppid;
const prependListener = process.prependListener ?? unenvProcess.prependListener;
const prependOnceListener = process.prependOnceListener ?? unenvProcess.prependOnceListener;
const rawListeners = process.rawListeners ?? unenvProcess.rawListeners;
const release = process.release ?? unenvProcess.release;
const removeAllListeners = process.removeAllListeners ?? unenvProcess.removeAllListeners;
const removeListener = process.removeListener ?? unenvProcess.removeListener;
const report = process.report ?? unenvProcess.report;
const resourceUsage = process.resourceUsage ?? unenvProcess.resourceUsage;
const setMaxListeners = process.setMaxListeners ?? unenvProcess.setMaxListeners;
const setSourceMapsEnabled = process.setSourceMapsEnabled ?? unenvProcess.setSourceMapsEnabled;
const stderr = process.stderr ?? unenvProcess.stderr;
const stdin = process.stdin ?? unenvProcess.stdin;
const stdout = process.stdout ?? unenvProcess.stdout;
const title = process.title ?? unenvProcess.title;
const umask = process.umask ?? unenvProcess.umask;
const uptime = process.uptime ?? unenvProcess.uptime;
const version = process.version ?? unenvProcess.version;
const versions = process.versions ?? unenvProcess.versions;
const domain = process.domain ?? unenvProcess.domain;
const initgroups = process.initgroups ?? unenvProcess.initgroups;
const moduleLoadList = process.moduleLoadList ?? unenvProcess.moduleLoadList;
const reallyExit = process.reallyExit ?? unenvProcess.reallyExit;
const openStdin = process.openStdin ?? unenvProcess.openStdin;
const assert = process.assert ?? unenvProcess.assert;
const binding = process.binding ?? unenvProcess.binding;
const send = process.send ?? unenvProcess.send;
const exitCode = process.exitCode ?? unenvProcess.exitCode;
const channel = process.channel ?? unenvProcess.channel;
const getegid = process.getegid ?? unenvProcess.getegid;
const geteuid = process.geteuid ?? unenvProcess.geteuid;
const getgid = process.getgid ?? unenvProcess.getgid;
const getgroups = process.getgroups ?? unenvProcess.getgroups;
const getuid = process.getuid ?? unenvProcess.getuid;
const setegid = process.setegid ?? unenvProcess.setegid;
const seteuid = process.seteuid ?? unenvProcess.seteuid;
const setgid = process.setgid ?? unenvProcess.setgid;
const setgroups = process.setgroups ?? unenvProcess.setgroups;
const setuid = process.setuid ?? unenvProcess.setuid;
const permission = process.permission ?? unenvProcess.permission;
const mainModule = process.mainModule ?? unenvProcess.mainModule;
const ref = process.ref ?? unenvProcess.ref;
const unref = process.unref ?? unenvProcess.unref;
const _events = process._events ?? unenvProcess._events;
const _eventsCount = process._eventsCount ?? unenvProcess._eventsCount;
const _exiting = process._exiting ?? unenvProcess._exiting;
const _maxListeners = process._maxListeners ?? unenvProcess._maxListeners;
const _debugEnd = process._debugEnd ?? unenvProcess._debugEnd;
const _debugProcess = process._debugProcess ?? unenvProcess._debugProcess;
const _fatalException = process._fatalException ?? unenvProcess._fatalException;
const _getActiveHandles = process._getActiveHandles ?? unenvProcess._getActiveHandles;
const _getActiveRequests = process._getActiveRequests ?? unenvProcess._getActiveRequests;
const _kill = process._kill ?? unenvProcess._kill;
const _preload_modules = process._preload_modules ?? unenvProcess._preload_modules;
const _rawDebug = process._rawDebug ?? unenvProcess._rawDebug;
const _startProfilerIdleNotifier = process._startProfilerIdleNotifier ?? unenvProcess._startProfilerIdleNotifier;
const _stopProfilerIdleNotifier = process._stopProfilerIdleNotifier ?? unenvProcess._stopProfilerIdleNotifier;
const _tickCallback = process._tickCallback ?? unenvProcess._tickCallback;
const _disconnect = process._disconnect ?? unenvProcess._disconnect;
const _handleQueue = process._handleQueue ?? unenvProcess._handleQueue;
const _pendingMessage = process._pendingMessage ?? unenvProcess._pendingMessage;
const _channel = process._channel ?? unenvProcess._channel;
const _send = process._send ?? unenvProcess._send;
const _linkedBinding = process._linkedBinding ?? unenvProcess._linkedBinding;
//#endregion
export { _channel, _debugEnd, _debugProcess, _disconnect, _events, _eventsCount, _exiting, _fatalException, _getActiveHandles, _getActiveRequests, _handleQueue, _kill, _linkedBinding, _maxListeners, _pendingMessage, _preload_modules, _rawDebug, _send, _startProfilerIdleNotifier, _stopProfilerIdleNotifier, _tickCallback, abort, addListener, allowedNodeEnvironmentFlags, arch, argv, argv0, assert, availableMemory, binding, channel, chdir, config, connected, constrainedMemory, cpuUsage, cwd, debugPort, process_default as default, disconnect, dlopen, domain, emit, emitWarning, env, eventNames, execArgv, execPath, exit, exitCode, features, finalization, getActiveResourcesInfo, getBuiltinModule, getMaxListeners, getegid, geteuid, getgid, getgroups, getuid, hasUncaughtExceptionCaptureCallback, hrtime, initgroups, kill, listenerCount, listeners, loadEnvFile, mainModule, memoryUsage, moduleLoadList, nextTick, off, on, once, openStdin, permission, pid, platform, ppid, prependListener, prependOnceListener, rawListeners, reallyExit, ref, release, removeAllListeners, removeListener, report, resourceUsage, send, setMaxListeners, setSourceMapsEnabled, setUncaughtExceptionCaptureCallback, setegid, seteuid, setgid, setgroups, setuid, sourceMapsEnabled, stderr, stdin, stdout, title, umask, unref, uptime, version, versions };
