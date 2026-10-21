// The app's notion of now: what it writes as the date of a note. The tests
// and the stories have a fixed instant in its place: see __mocks__/clock.ts.
export const now = (): Date => new Date();
