// By a path of the tsconfig, which Next resolves for a `.js` file too.
import { label } from "@/app/plain-js/label.js";
// JSX in a `.js` file, as an app without TypeScript has it.
export function PlainWidget() {
  return <p>{label}</p>;
}
