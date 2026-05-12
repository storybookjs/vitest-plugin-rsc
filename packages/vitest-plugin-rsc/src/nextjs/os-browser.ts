export const EOL = "\n";
export const constants = {};
export const devNull = "/dev/null";

export function arch() {
  return "x64";
}

export function availableParallelism() {
  return 1;
}

export function cpus() {
  return [
    {
      model: "vitest-plugin-rsc",
      speed: 0,
      times: {
        user: 0,
        nice: 0,
        sys: 0,
        idle: 0,
        irq: 0,
      },
    },
  ];
}

export function endianness() {
  return "LE";
}

export function freemem() {
  return 0;
}

export function homedir() {
  return "/";
}

export function hostname() {
  return "localhost";
}

export function machine() {
  return "x86_64";
}

export function networkInterfaces() {
  return {};
}

export function platform() {
  return "browser";
}

export function release() {
  return "0.0.0";
}

export function tmpdir() {
  return "/tmp";
}

export function totalmem() {
  return 0;
}

export function type() {
  return "Browser";
}

export function userInfo() {
  return {
    uid: -1,
    gid: -1,
    username: "browser",
    homedir: homedir(),
    shell: null,
  };
}

export function version() {
  return "Browser";
}

export default {
  EOL,
  arch,
  availableParallelism,
  constants,
  cpus,
  devNull,
  endianness,
  freemem,
  homedir,
  hostname,
  machine,
  networkInterfaces,
  platform,
  release,
  tmpdir,
  totalmem,
  type,
  userInfo,
  version,
};
