// A module of the package without `"use client"`, which the browser layer
// reaches only by an import of tag.js: as the package says it has no side
// effects, a build that keeps no binding of this import, like Vite RSC's
// scan, drops the module and its import of `host-report/tags`.
import { tagged } from "host-report/tags";

export { tagged };
