// Links that a browser follows without Next's router, to route handlers that
// answer with something other than a page.
export default function ExportsPage() {
  return (
    <>
      <h1>Exports</h1>
      {/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
      <a href="/api/export">Notes as CSV</a>
      <a href="/api/export" download="export.csv">
        Notes as CSV, named by the link
      </a>
      <a href="/api/export/summary" download="summary.json">
        Summary as a file
      </a>
      {/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
      <a href="/api/export/summary">Summary</a>
      <a href="/host.json" download>
        A file of public/
      </a>
      <a href="/api/export/failed" download="failed.csv">
        An export that fails
      </a>
    </>
  );
}
