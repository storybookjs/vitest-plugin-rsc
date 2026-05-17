import { test } from "vitest";

const serverActionProtocolWorkerReason =
  "P2(server-action-protocol): migrate the broad component matrix to real App Page fixtures through generated Edge App Page + MSW";

// Done in app/edge-app-page-delegation/page.test.tsx: focused real action
// redirects assert Next's 303 + x-action-redirect protocol response through the
// generated Edge App Page handler and MSW. Keep the broader matrix here until
// action errors, access fallbacks, and cache/revalidation actions can run
// through the same generated route without optimizer-side RSDW virtual imports.
test.todo(
  `broader action redirect variants render through client navigation (${serverActionProtocolWorkerReason})`,
);
test.todo(
  `action errors return Next rejected Flight responses (${serverActionProtocolWorkerReason})`,
);
test.todo(
  `action access fallbacks preserve Next status and Flight payloads (${serverActionProtocolWorkerReason})`,
);
test.todo(
  `incoming next-url keeps route payloads non-interceptable (${serverActionProtocolWorkerReason})`,
);
test.todo(
  `action refresh and cache invalidation headers pass through MSW (${serverActionProtocolWorkerReason})`,
);
