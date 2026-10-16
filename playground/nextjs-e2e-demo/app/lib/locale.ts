import "client-only";

// State of the browser layer that a setup sets, like the language of an i18n
// library. `client-only` keeps it out of the server.
let locale = "unset";

export const setLocale = (next: string): void => {
  locale = next;
};
export const getLocale = (): string => locale;
