import "client-only";

// A module of the browser layer that listens on `window` as it loads, as a
// module of an app can. The page that loaded it takes the listener with it.
export const message = "nextjs-e2e-demo:listens";
let heard = 0;
window.addEventListener("message", (event) => {
  if (event.data === message) heard++;
});

export const timesHeard = (): number => heard;
