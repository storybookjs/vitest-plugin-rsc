import { revalidateTag } from "next/cache";
import { jsx as _jsx } from "react/jsx-runtime";
export async function getCount() {
	"use cache";
	return 1;
}
export default function Page() {
	const tag = "count";
	const bump = /* #__PURE__ */ $$ReactServer.registerServerReference($$hoist_0_bump, "/app/x.tsx", "$$hoist_0_bump").bind(null, __vite_rsc_encryption_runtime.encryptActionBoundArgs([tag]));
	return /* @__PURE__ */ _jsx("form", {
		action: bump,
		children: /* @__PURE__ */ _jsx("button", { children: "bump" })
	});
}

;export async function $$hoist_0_bump($$hoist_encoded) {
		const [tag] = await __vite_rsc_encryption_runtime.decryptActionBoundArgs($$hoist_encoded);
"use server";
		revalidateTag(tag, "max");
	};
/* #__PURE__ */ Object.defineProperty($$hoist_0_bump, "name", { value: "bump" });
