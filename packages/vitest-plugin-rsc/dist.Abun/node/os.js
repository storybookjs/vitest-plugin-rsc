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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/os.mjs
const constants = {
	UV_UDP_REUSEADDR: 4,
	dlopen: {
		RTLD_LAZY: 1,
		RTLD_NOW: 2,
		RTLD_GLOBAL: 256,
		RTLD_LOCAL: 0,
		RTLD_DEEPBIND: 8
	},
	errno: {
		E2BIG: 7,
		EACCES: 13,
		EADDRINUSE: 98,
		EADDRNOTAVAIL: 99,
		EAFNOSUPPORT: 97,
		EAGAIN: 11,
		EALREADY: 114,
		EBADF: 9,
		EBADMSG: 74,
		EBUSY: 16,
		ECANCELED: 125,
		ECHILD: 10,
		ECONNABORTED: 103,
		ECONNREFUSED: 111,
		ECONNRESET: 104,
		EDEADLK: 35,
		EDESTADDRREQ: 89,
		EDOM: 33,
		EDQUOT: 122,
		EEXIST: 17,
		EFAULT: 14,
		EFBIG: 27,
		EHOSTUNREACH: 113,
		EIDRM: 43,
		EILSEQ: 84,
		EINPROGRESS: 115,
		EINTR: 4,
		EINVAL: 22,
		EIO: 5,
		EISCONN: 106,
		EISDIR: 21,
		ELOOP: 40,
		EMFILE: 24,
		EMLINK: 31,
		EMSGSIZE: 90,
		EMULTIHOP: 72,
		ENAMETOOLONG: 36,
		ENETDOWN: 100,
		ENETRESET: 102,
		ENETUNREACH: 101,
		ENFILE: 23,
		ENOBUFS: 105,
		ENODATA: 61,
		ENODEV: 19,
		ENOENT: 2,
		ENOEXEC: 8,
		ENOLCK: 37,
		ENOLINK: 67,
		ENOMEM: 12,
		ENOMSG: 42,
		ENOPROTOOPT: 92,
		ENOSPC: 28,
		ENOSR: 63,
		ENOSTR: 60,
		ENOSYS: 38,
		ENOTCONN: 107,
		ENOTDIR: 20,
		ENOTEMPTY: 39,
		ENOTSOCK: 88,
		ENOTSUP: 95,
		ENOTTY: 25,
		ENXIO: 6,
		EOPNOTSUPP: 95,
		EOVERFLOW: 75,
		EPERM: 1,
		EPIPE: 32,
		EPROTO: 71,
		EPROTONOSUPPORT: 93,
		EPROTOTYPE: 91,
		ERANGE: 34,
		EROFS: 30,
		ESPIPE: 29,
		ESRCH: 3,
		ESTALE: 116,
		ETIME: 62,
		ETIMEDOUT: 110,
		ETXTBSY: 26,
		EWOULDBLOCK: 11,
		EXDEV: 18
	},
	signals: {
		SIGHUP: 1,
		SIGINT: 2,
		SIGQUIT: 3,
		SIGILL: 4,
		SIGTRAP: 5,
		SIGABRT: 6,
		SIGIOT: 6,
		SIGBUS: 7,
		SIGFPE: 8,
		SIGKILL: 9,
		SIGUSR1: 10,
		SIGSEGV: 11,
		SIGUSR2: 12,
		SIGPIPE: 13,
		SIGALRM: 14,
		SIGTERM: 15,
		SIGCHLD: 17,
		SIGSTKFLT: 16,
		SIGCONT: 18,
		SIGSTOP: 19,
		SIGTSTP: 20,
		SIGTTIN: 21,
		SIGTTOU: 22,
		SIGURG: 23,
		SIGXCPU: 24,
		SIGXFSZ: 25,
		SIGVTALRM: 26,
		SIGPROF: 27,
		SIGWINCH: 28,
		SIGIO: 29,
		SIGPOLL: 29,
		SIGPWR: 30,
		SIGSYS: 31
	},
	priority: {
		PRIORITY_LOW: 19,
		PRIORITY_BELOW_NORMAL: 10,
		PRIORITY_NORMAL: 0,
		PRIORITY_ABOVE_NORMAL: -7,
		PRIORITY_HIGH: -14,
		PRIORITY_HIGHEST: -20
	}
};
const NUM_CPUS = 8;
const availableParallelism = () => NUM_CPUS;
const arch = () => "";
const machine = () => "";
const endianness = () => "LE";
const cpus = () => {
	const info = {
		model: "",
		speed: 0,
		times: {
			user: 0,
			nice: 0,
			sys: 0,
			idle: 0,
			irq: 0
		}
	};
	return Array.from({ length: NUM_CPUS }, () => info);
};
const getPriority = () => 0;
const setPriority = /* @__PURE__ */ notImplemented("os.setPriority");
const homedir = () => "/";
const tmpdir = () => "/tmp";
const devNull = "/dev/null";
const freemem = () => 0;
const totalmem = () => 0;
const loadavg = () => [
	0,
	0,
	0
];
const uptime = () => 0;
const hostname = () => "";
const networkInterfaces = () => {
	return { lo0: [
		{
			address: "127.0.0.1",
			netmask: "255.0.0.0",
			family: "IPv4",
			mac: "00:00:00:00:00:00",
			internal: true,
			cidr: "127.0.0.1/8"
		},
		{
			address: "::1",
			netmask: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
			family: "IPv6",
			mac: "00:00:00:00:00:00",
			internal: true,
			cidr: "::1/128",
			scopeid: 0
		},
		{
			address: "fe80::1",
			netmask: "ffff:ffff:ffff:ffff::",
			family: "IPv6",
			mac: "00:00:00:00:00:00",
			internal: true,
			cidr: "fe80::1/64",
			scopeid: 1
		}
	] };
};
const platform = () => "linux";
const type = () => "Linux";
const release = () => "";
const version = () => "";
const userInfo = (opts) => {
	const encode = (str) => {
		if (opts?.encoding) {
			const buff = Buffer.from(str);
			return opts.encoding === "buffer" ? buff : buff.toString(opts.encoding);
		}
		return str;
	};
	return {
		gid: 1e3,
		uid: 1e3,
		homedir: encode("/"),
		shell: encode("/bin/sh"),
		username: encode("root")
	};
};
const EOL = "\n";
var os_default = {
	arch,
	availableParallelism,
	constants,
	cpus,
	EOL: "\n",
	endianness,
	devNull,
	freemem,
	getPriority,
	homedir,
	hostname,
	loadavg,
	machine,
	networkInterfaces,
	platform,
	release,
	setPriority,
	tmpdir,
	totalmem,
	type,
	uptime,
	userInfo,
	version
};
//#endregion
export { EOL, arch, availableParallelism, constants, cpus, os_default as default, devNull, endianness, freemem, getPriority, homedir, hostname, loadavg, machine, networkInterfaces, platform, release, setPriority, tmpdir, totalmem, type, uptime, userInfo, version };
