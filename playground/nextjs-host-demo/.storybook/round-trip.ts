// How long `play` waits for what a Server Action or a navigation renders: a
// request to the app and its render, whose first one compiles or loads code,
// which takes longer than Testing Library's default of 1 s on a slow machine,
// as on CI.
export const roundTrip = { timeout: 30_000 };
