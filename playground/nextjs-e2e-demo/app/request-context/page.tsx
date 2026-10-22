import { RequestContext } from "../components/request-context.tsx";

// What a package keeps of the request as the ssr layer renders a Client
// Component: see api/request-context.test.ts.
export default function RequestContextPage() {
  return <RequestContext />;
}
