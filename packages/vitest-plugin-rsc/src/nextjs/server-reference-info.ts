export interface ServerReferenceInfo {
  type: "server-action" | "use-cache";
  usedArgs: [boolean, boolean, boolean, boolean, boolean, boolean];
  hasRestArgs: boolean;
}

export function extractInfoFromServerReferenceId(id: string): ServerReferenceInfo {
  return /^[0-9a-fA-F]+$/.test(id)
    ? extractNextInfoFromServerReferenceId(id)
    : {
        type: "server-action",
        usedArgs: [true, true, true, true, true, true],
        hasRestArgs: true,
      };
}

// Copied from Next's server-reference-info.ts. Vite RSC server reference IDs
// are not hex-encoded Next IDs, so the public extractor above preserves all
// arguments for those actions before Next's serverActionReducer encodes them:
// https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/shared/lib/server-reference-info.ts
function extractNextInfoFromServerReferenceId(id: string): ServerReferenceInfo {
  const infoByte = parseInt(id.slice(0, 2), 16);
  const typeBit = (infoByte >> 7) & 0x1;
  const argMask = (infoByte >> 1) & 0x3f;
  const restArgs = infoByte & 0x1;
  const usedArgs = Array(6);

  for (let index = 0; index < 6; index++) {
    const bitPosition = 5 - index;
    const bit = (argMask >> bitPosition) & 0x1;
    usedArgs[index] = bit === 1;
  }

  return {
    type: typeBit === 1 ? "use-cache" : "server-action",
    usedArgs: usedArgs as [boolean, boolean, boolean, boolean, boolean, boolean],
    hasRestArgs: restArgs === 1,
  };
}

export function omitUnusedArgs(args: unknown[], info: ServerReferenceInfo): unknown[] {
  const filteredArgs = new Array(args.length);
  let length = 0;

  for (let index = 0; index < args.length; index++) {
    if ((index < 6 && info.usedArgs[index]) || (index >= 6 && info.hasRestArgs)) {
      filteredArgs[index] = args[index];
      length = index + 1;
    }
  }

  filteredArgs.length = length;

  return filteredArgs;
}
