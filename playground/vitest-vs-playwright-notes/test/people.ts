// The people of the tests of both runners. Nothing empties the database
// between tests, and Playwright's workers share it, so a test signs up and
// signs in as people of its own: `person(ada)`, Ada with an email no other
// test has.

export type Person = { name: string; email: string; password: string };

export const ada: Person = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct horse",
};
export const grace: Person = {
  name: "Grace Hopper",
  email: "grace@example.com",
  password: "battery staple",
};

/** The person with an email of their own, `ada+1a2b3c4d@example.com`: the same name and password. */
export function person(base: Person): Person {
  const [local, domain] = base.email.split("@");
  return { ...base, email: `${local}+${crypto.randomUUID().slice(0, 8)}@${domain}` };
}
