import "client-only";

// State of the browser layer that a setup sets, like the language of an i18n
// library. `client-only` keeps it out of the server.
let locale = "unset";
let sets = 0;

export const setLocale = (next: string): void => {
  locale = next;
  sets++;
};
export const getLocale = (): string => locale;
/** How often the locale was set: once by the setup, for the tab. */
export const localeSets = (): number => sets;
