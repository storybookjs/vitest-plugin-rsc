// A package that keeps the request it handles in an `AsyncLocalStorage` of
// Node's, as React's renderer for Node.js keeps the request of a render: it
// enters the store as the work starts, and reads it back from work it does
// later. CommonJS, as React's builds are, so the optimizer bundles it.
const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

exports.handle = (request, work) => storage.run(request, work);
exports.enterRequest = (request) => storage.enterWith(request);
exports.currentRequest = () => storage.getStore();
