import "client-only";

// A module of the browser layer, with state. `client-only` keeps it out of the
// server.
let presses = 0;

export const pressed = (): number => ++presses;
export const countPresses = (): number => presses;
