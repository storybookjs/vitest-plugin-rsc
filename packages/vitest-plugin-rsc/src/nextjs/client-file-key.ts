// The plugin puts a line in front of the module of the rsc layer for a file
// with `"use client"`, which Vite RSC made a client reference module, see
// `clientFileCode()` in client-files.ts. That line exports the file's
// reference key under this name, the plugin's own: `loadClientModule()` in
// client-graph.ts tells the module of such a file by it, and finds the
// file's evaluation in the browser layer by its value.

/** The name of the export with the reference key of a file with `"use client"`. */
export const clientFileKeyExport = "__vitest_plugin_rsc_client_file__";
