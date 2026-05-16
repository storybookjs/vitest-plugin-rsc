import process from "node:process";

const vitestPluginRscSourceCondition = "vitest-plugin-rsc-source";

const nodeConditionArguments = [
  process.execArgv.join(" "),
  // oxlint-disable-next-line no-process-env
  process.env.NODE_OPTIONS ?? "",
].join(" ");

export const vitestPluginRscSourceConditions = hasNodeCondition(vitestPluginRscSourceCondition)
  ? [vitestPluginRscSourceCondition]
  : [];

function hasNodeCondition(condition: string): boolean {
  return new RegExp(
    `(?:^|\\s)(?:--conditions(?:=|\\s+)|-C(?:=|\\s+))${escapeRegExp(condition)}(?:\\s|$)`,
  ).test(nodeConditionArguments);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
