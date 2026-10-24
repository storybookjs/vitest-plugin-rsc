//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
/* @__NO_SIDE_EFFECTS__ */
function createNotImplementedError(name) {
	return /* @__PURE__ */ new Error(`[unenv] ${name} is not implemented yet!`);
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/perf_hooks/histogram.mjs
var Histogram = class {
	min = 0x8000000000000000;
	max = 0;
	mean = NaN;
	exceeds = 0;
	stddev = NaN;
	count = 0;
	countBigInt = BigInt(0);
	exceedsBigInt = BigInt(0);
	maxBigInt = 0;
	minBigInt = BigInt(9223372036854775807n);
	percentiles = /* @__PURE__ */ new Map();
	percentilesBigInt = /* @__PURE__ */ new Map();
	percentileBigInt(_percentile) {
		throw /* @__PURE__ */ createNotImplementedError("Histogram.percentileBigInt");
	}
	percentile(percentile) {
		return this.percentiles.get(percentile) ?? NaN;
	}
	reset() {
		throw /* @__PURE__ */ createNotImplementedError("Histogram.reset");
	}
};
var IntervalHistogram = class extends Histogram {
	enable() {
		return true;
	}
	disable() {
		return true;
	}
};
var RecordableHistogram = class extends Histogram {
	record(val) {
		throw /* @__PURE__ */ createNotImplementedError("RecordableHistogram.record");
	}
	recordDelta() {
		throw /* @__PURE__ */ createNotImplementedError("RecordableHistogram.recordDelta");
	}
	add(other) {
		throw /* @__PURE__ */ createNotImplementedError("RecordableHistogram.add");
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
const _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
const _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
const nodeTiming = {
	name: "node",
	entryType: "node",
	startTime: 0,
	duration: 0,
	nodeStart: 0,
	v8Start: 0,
	bootstrapComplete: 0,
	environment: 0,
	loopStart: 0,
	loopExit: 0,
	idleTime: 0,
	uvMetricsInfo: {
		loopCount: 0,
		events: 0,
		eventsWaiting: 0
	},
	detail: void 0,
	toJSON() {
		return this;
	}
};
var PerformanceEntry = class {
	__unenv__ = true;
	detail;
	entryType = "event";
	name;
	startTime;
	constructor(name, options) {
		this.name = name;
		this.startTime = options?.startTime || _performanceNow();
		this.detail = options?.detail;
	}
	get duration() {
		return _performanceNow() - this.startTime;
	}
	toJSON() {
		return {
			name: this.name,
			entryType: this.entryType,
			startTime: this.startTime,
			duration: this.duration,
			detail: this.detail
		};
	}
};
const PerformanceMark = class PerformanceMark extends PerformanceEntry {
	entryType = "mark";
	constructor() {
		super(...arguments);
	}
	get duration() {
		return 0;
	}
};
var PerformanceMeasure = class extends PerformanceEntry {
	entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
	entryType = "resource";
	serverTiming = [];
	connectEnd = 0;
	connectStart = 0;
	decodedBodySize = 0;
	domainLookupEnd = 0;
	domainLookupStart = 0;
	encodedBodySize = 0;
	fetchStart = 0;
	initiatorType = "";
	name = "";
	nextHopProtocol = "";
	redirectEnd = 0;
	redirectStart = 0;
	requestStart = 0;
	responseEnd = 0;
	responseStart = 0;
	secureConnectionStart = 0;
	startTime = 0;
	transferSize = 0;
	workerStart = 0;
	responseStatus = 0;
};
var PerformanceObserverEntryList = class {
	__unenv__ = true;
	getEntries() {
		return [];
	}
	getEntriesByName(_name, _type) {
		return [];
	}
	getEntriesByType(type) {
		return [];
	}
};
var Performance = class {
	__unenv__ = true;
	timeOrigin = _timeOrigin;
	eventCounts = /* @__PURE__ */ new Map();
	_entries = [];
	_resourceTimingBufferSize = 0;
	navigation = void 0;
	timing = void 0;
	timerify(_fn, _options) {
		throw /* @__PURE__ */ createNotImplementedError("Performance.timerify");
	}
	get nodeTiming() {
		return nodeTiming;
	}
	eventLoopUtilization() {
		return {};
	}
	markResourceTiming() {
		return new PerformanceResourceTiming("");
	}
	onresourcetimingbufferfull = null;
	now() {
		if (this.timeOrigin === _timeOrigin) return _performanceNow();
		return Date.now() - this.timeOrigin;
	}
	clearMarks(markName) {
		this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
	}
	clearMeasures(measureName) {
		this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
	}
	clearResourceTimings() {
		this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
	}
	getEntries() {
		return this._entries;
	}
	getEntriesByName(name, type) {
		return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
	}
	getEntriesByType(type) {
		return this._entries.filter((e) => e.entryType === type);
	}
	mark(name, options) {
		const entry = new PerformanceMark(name, options);
		this._entries.push(entry);
		return entry;
	}
	measure(measureName, startOrMeasureOptions, endMark) {
		let start;
		let end;
		if (typeof startOrMeasureOptions === "string") {
			start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
			end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
		} else {
			start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
			end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
		}
		const entry = new PerformanceMeasure(measureName, {
			startTime: start,
			detail: {
				start,
				end
			}
		});
		this._entries.push(entry);
		return entry;
	}
	setResourceTimingBufferSize(maxSize) {
		this._resourceTimingBufferSize = maxSize;
	}
	addEventListener(type, listener, options) {
		throw /* @__PURE__ */ createNotImplementedError("Performance.addEventListener");
	}
	removeEventListener(type, listener, options) {
		throw /* @__PURE__ */ createNotImplementedError("Performance.removeEventListener");
	}
	dispatchEvent(event) {
		throw /* @__PURE__ */ createNotImplementedError("Performance.dispatchEvent");
	}
	toJSON() {
		return this;
	}
};
var PerformanceObserver = class {
	__unenv__ = true;
	static supportedEntryTypes = [];
	_callback = null;
	constructor(callback) {
		this._callback = callback;
	}
	takeRecords() {
		return [];
	}
	disconnect() {
		throw /* @__PURE__ */ createNotImplementedError("PerformanceObserver.disconnect");
	}
	observe(options) {
		throw /* @__PURE__ */ createNotImplementedError("PerformanceObserver.observe");
	}
	bind(fn) {
		return fn;
	}
	runInAsyncScope(fn, thisArg, ...args) {
		return fn.call(thisArg, ...args);
	}
	asyncId() {
		return 0;
	}
	triggerAsyncId() {
		return 0;
	}
	emitDestroy() {
		return this;
	}
};
const performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/perf_hooks.mjs
const constants = {
	NODE_PERFORMANCE_GC_MAJOR: 4,
	NODE_PERFORMANCE_GC_MINOR: 1,
	NODE_PERFORMANCE_GC_INCREMENTAL: 8,
	NODE_PERFORMANCE_GC_WEAKCB: 16,
	NODE_PERFORMANCE_GC_FLAGS_NO: 0,
	NODE_PERFORMANCE_GC_FLAGS_CONSTRUCT_RETAINED: 2,
	NODE_PERFORMANCE_GC_FLAGS_FORCED: 4,
	NODE_PERFORMANCE_GC_FLAGS_SYNCHRONOUS_PHANTOM_PROCESSING: 8,
	NODE_PERFORMANCE_GC_FLAGS_ALL_AVAILABLE_GARBAGE: 16,
	NODE_PERFORMANCE_GC_FLAGS_ALL_EXTERNAL_MEMORY: 32,
	NODE_PERFORMANCE_GC_FLAGS_SCHEDULE_IDLE: 64,
	NODE_PERFORMANCE_ENTRY_TYPE_GC: 0,
	NODE_PERFORMANCE_ENTRY_TYPE_HTTP: 1,
	NODE_PERFORMANCE_ENTRY_TYPE_HTTP2: 2,
	NODE_PERFORMANCE_ENTRY_TYPE_NET: 3,
	NODE_PERFORMANCE_ENTRY_TYPE_DNS: 4,
	NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN_TIMESTAMP: 0,
	NODE_PERFORMANCE_MILESTONE_TIME_ORIGIN: 1,
	NODE_PERFORMANCE_MILESTONE_ENVIRONMENT: 2,
	NODE_PERFORMANCE_MILESTONE_NODE_START: 3,
	NODE_PERFORMANCE_MILESTONE_V8_START: 4,
	NODE_PERFORMANCE_MILESTONE_LOOP_START: 5,
	NODE_PERFORMANCE_MILESTONE_LOOP_EXIT: 6,
	NODE_PERFORMANCE_MILESTONE_BOOTSTRAP_COMPLETE: 7
};
const monitorEventLoopDelay = function(_options) {
	return new IntervalHistogram();
};
const createHistogram = function(_options) {
	return new RecordableHistogram();
};
var perf_hooks_default = {
	Performance,
	PerformanceMark,
	PerformanceEntry,
	PerformanceMeasure,
	PerformanceObserverEntryList,
	PerformanceObserver,
	PerformanceResourceTiming,
	performance,
	constants,
	createHistogram,
	monitorEventLoopDelay
};
//#endregion
export { Performance, PerformanceEntry, PerformanceMark, PerformanceMeasure, PerformanceObserver, PerformanceObserverEntryList, PerformanceResourceTiming, constants, createHistogram, perf_hooks_default as default, monitorEventLoopDelay, performance };
