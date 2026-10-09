// What a package does that loads a file of its own, like the `.wasm` of a
// database that runs in the browser: it refers to the file, and does not
// import it.
export const archiveUrl = new URL("./archive.data", import.meta.url);
