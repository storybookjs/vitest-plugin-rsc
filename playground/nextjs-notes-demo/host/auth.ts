// The auth server of the app, which is not in the browser: what `vitest.setup.ts`
// mocks it with. A page asks for the passkeys of the user, and the forms of
// the auth pages call the rest.
const notThere = (name: string) => async () => {
  throw new Error(`The host has no auth server: auth.api.${name}() is not there.`);
};

export const auth = {
  api: {
    listPasskeys: async () => [],
    deletePasskey: notThere("deletePasskey"),
    signInEmail: notThere("signInEmail"),
    signInMagicLink: notThere("signInMagicLink"),
    signOut: notThere("signOut"),
    signUpEmail: notThere("signUpEmail"),
  },
};
