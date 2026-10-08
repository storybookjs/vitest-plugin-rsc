import "client-only";

// Only a browser has this.
export function getViewportWidth(): number {
  return window.innerWidth;
}
