import { loadNextProject } from "/Users/kasperpeulen/code/github/storybookjs/vitest-plugin-rsc/.claude/worktrees/agent-af4b1127992764e28/packages/vitest-plugin-rsc/src/next/project.ts";
const p = await loadNextProject("/Users/kasperpeulen/code/github/storybookjs/vitest-plugin-rsc/.claude/worktrees/agent-af4b1127992764e28/playground/next-e2e-demo");
for (const [k, v] of Object.entries(p.aliases.rsc)) if (/jsx|private-next-rsc|react\$|react\/compiler/.test(k)) console.log(k, "->", v);
console.log(Object.entries(p.defines.rsc).filter(([k]) => /CACHE|PPR|DYNAMIC|USE_CACHE|CACHE_LIFE/i.test(k)));
process.exit(0);
