// mysql2 in the tests, in place of the package, which needs Node.js: the
// ORM gets a pool from test/mariadb.ts instead. Drizzle imports this for a
// URL that it would make a pool of.
function createPool(): never {
  throw new Error("The tests have no MySQL server: give the ORM a pool of test/mariadb.ts.");
}

export { createPool, createPool as createConnection };
export default { createPool, createConnection: createPool };
