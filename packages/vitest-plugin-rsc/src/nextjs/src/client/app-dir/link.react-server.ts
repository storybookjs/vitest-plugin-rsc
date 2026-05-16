// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/app-dir/link.react-server.tsx#L1-L30
// Adaptation: Vite RSC needs a virtual module source string so the RSC graph
// can import a client reference instead of bundling Next's client link module
// into the server environment.
// Begin adapted: Next.js app-dir link react-server wrapper
export function createNextLinkReactServerSource(clientReferenceId: string) {
  return `
import { jsx } from "react/jsx-runtime";
import Link, { useLinkStatus } from ${JSON.stringify(clientReferenceId)};

export { useLinkStatus };

export default function LinkComponent(props) {
  const isLegacyBehavior = props.legacyBehavior;
  const childIsHostComponent =
    typeof props.children === "string" ||
    typeof props.children === "number" ||
    typeof props.children?.type === "string";
  const childIsClientComponent = props.children?.type?.$$typeof === Symbol.for("react.client.reference");
  if (isLegacyBehavior && !childIsHostComponent && !childIsClientComponent) {
    if (props.children?.type?.$$typeof === Symbol.for("react.lazy")) {
      console.error("Using a Lazy Component as a direct child of \`<Link legacyBehavior>\` from a Server Component is not supported. If you need legacyBehavior, wrap your Lazy Component in a Client Component that renders the Link's \`<a>\` tag.");
    } else {
      console.error("Using a Server Component as a direct child of \`<Link legacyBehavior>\` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's \`<a>\` tag.");
    }
  }
  return jsx(Link, { ...props });
}
`;
}
// End adapted
