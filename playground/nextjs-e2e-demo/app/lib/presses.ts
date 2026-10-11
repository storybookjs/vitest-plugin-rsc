import "client-only";

// State of a module of the browser layer: every page load starts it again.
let presses = 0;

export const pressed = (): number => ++presses;
export const countPresses = (): number => presses;
