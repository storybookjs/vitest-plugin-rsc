// mariadb in the tests, in place of the package, which needs Node.js: the
// ORM gets a pool from test/mariadb.ts instead. Prisma's adapter imports this
// for a URL that it would make a pool of.
export function createPool(): never {
  throw new Error("The tests have no MySQL server: give the ORM a pool of test/mariadb.ts.");
}
