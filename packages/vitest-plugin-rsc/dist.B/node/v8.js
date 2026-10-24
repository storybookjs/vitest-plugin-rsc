import { Readable } from "node:stream";
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {}, { __unenv__: true });
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/v8/deserializer.mjs
var Deserializer = class {
	readHeader() {
		return false;
	}
	readValue() {}
	transferArrayBuffer(id, arrayBuffer) {}
	getWireFormatVersion() {
		return 0;
	}
	readUint32() {
		return 0;
	}
	readUint64() {
		return [0, 0];
	}
	readDouble() {
		return 0;
	}
	readRawBytes(length) {
		return Buffer.from("");
	}
};
var DefaultDeserializer = class extends Deserializer {};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/v8/serializer.mjs
var Serializer = class {
	writeHeader() {}
	writeValue(val) {
		return false;
	}
	releaseBuffer() {
		return Buffer.from("");
	}
	transferArrayBuffer(id, arrayBuffer) {}
	writeDouble(value) {}
	writeUint32(value) {}
	writeUint64(hi, lo) {}
	writeRawBytes(buffer) {}
};
var DefaultSerializer = class extends Serializer {};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/v8/profiler.mjs
var GCProfiler = class {
	start() {}
	stop() {
		return {
			version: 1,
			startTime: 0,
			endTime: 0,
			statistics: []
		};
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/v8.mjs
const getMockHeapSpaceStats = (name) => ({
	space_name: name,
	space_size: 0,
	space_used_size: 0,
	space_available_size: 0,
	physical_space_size: 0
});
const cachedDataVersionTag = () => 0;
const deserialize = noop_default;
const getHeapCodeStatistics = () => ({
	code_and_metadata_size: 0,
	bytecode_and_metadata_size: 0,
	external_script_source_size: 0,
	cpu_profiler_metadata_size: 0
});
const getHeapSpaceStatistics = () => [
	"read_only_space",
	"new_space",
	"old_space",
	"code_space",
	"map_space",
	"large_object_space",
	"code_large_object_space",
	"new_large_object_space"
].map((space) => getMockHeapSpaceStats(space));
const getHeapStatistics = () => ({
	total_heap_size: 0,
	total_heap_size_executable: 0,
	total_physical_size: 0,
	total_available_size: 0,
	used_heap_size: 0,
	heap_size_limit: 0,
	malloced_memory: 0,
	peak_malloced_memory: 0,
	does_zap_garbage: 0,
	number_of_native_contexts: 0,
	number_of_detached_contexts: 0,
	total_global_handles_size: 0,
	used_global_handles_size: 0,
	external_memory: 0
});
const getHeapSnapshot = () => {
	return Readable.from(`{
    snapshot: {},
    nodes: [],
    edges: [],
    trace_function_infos: [],
    trace_tree: [],
    samples: [],
    locations: [],
    strings: [],
  }`);
};
const promiseHooks = {
	onInit: () => noop_default,
	onSettled: () => noop_default,
	onBefore: () => noop_default,
	onAfter: () => noop_default,
	createHook: () => noop_default
};
const serialize = (value) => Buffer.from(value);
const setFlagsFromString = noop_default;
const setHeapSnapshotNearHeapLimit = noop_default;
const startupSnapshot = {
	addDeserializeCallback: noop_default,
	addSerializeCallback: noop_default,
	setDeserializeMainFunction: noop_default,
	isBuildingSnapshot: () => false
};
const stopCoverage = noop_default;
const takeCoverage = noop_default;
const writeHeapSnapshot = () => "";
function queryObjects(_ctor, options) {
	if (options?.format === "count") return 0;
	return [];
}
var v8_default = {
	DefaultDeserializer,
	Deserializer,
	GCProfiler,
	DefaultSerializer,
	Serializer,
	cachedDataVersionTag,
	deserialize,
	getHeapCodeStatistics,
	getHeapSnapshot,
	getHeapSpaceStatistics,
	getHeapStatistics,
	promiseHooks,
	serialize,
	setFlagsFromString,
	setHeapSnapshotNearHeapLimit,
	startupSnapshot,
	stopCoverage,
	takeCoverage,
	writeHeapSnapshot,
	queryObjects
};
//#endregion
export { DefaultDeserializer, DefaultSerializer, Deserializer, GCProfiler, Serializer, cachedDataVersionTag, v8_default as default, deserialize, getHeapCodeStatistics, getHeapSnapshot, getHeapSpaceStatistics, getHeapStatistics, promiseHooks, queryObjects, serialize, setFlagsFromString, setHeapSnapshotNearHeapLimit, startupSnapshot, stopCoverage, takeCoverage, writeHeapSnapshot };
